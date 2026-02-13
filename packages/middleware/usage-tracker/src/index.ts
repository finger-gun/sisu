import type {
  Middleware,
  ModelResponse,
  Message,
  ModelEvent,
} from "@sisu-ai/core";

export type PriceTable = Record<
  string,
  {
    // Prefer per 1M token pricing for text (matches provider docs)
    inputPer1M?: number;
    outputPer1M?: number;
    // Back-compat: allow per 1K as well
    inputPer1K?: number;
    outputPer1K?: number;
    // Vision pricing options (choose one):
    // 1) Fixed per-image pricing
    imagePerImage?: number; // e.g. 0.000217 USD per image if $0.217/K images
    // Alias: per 1K images
    imagePer1K?: number; // e.g. 0.217 USD per 1K images
    // 2) Per-1K image tokens pricing (approximate):
    imageInputPer1K?: number; // e.g. 0.217 USD per 1K "image tokens"
    imageTokenPerImage?: number; // default 1000 image tokens per image
  }
>;

export interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUSD?: number;
  imageTokens?: number;
  imageCount?: number;
}

export function usageTracker(
  prices: PriceTable,
  opts: { logPerCall?: boolean } = {},
): Middleware {
  return async (ctx, next) => {
    // Wrap model.generate to intercept responses
    const orig = ctx.model.generate.bind(ctx.model);
    const price = prices[ctx.model.name] ?? prices["*"];

    const state = ctx.state as {
      usage?: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
        costUSD?: number;
        imageTokens?: number;
        imageCount?: number;
      };
    };
    const totals: UsageTotals = {
      promptTokens: Number(state.usage?.promptTokens ?? 0),
      completionTokens: Number(state.usage?.completionTokens ?? 0),
      totalTokens: Number(state.usage?.totalTokens ?? 0),
      costUSD: Number(state.usage?.costUSD ?? 0),
    };

    function applyUsage(
      out: ModelResponse,
      imageCount: number,
      imageTokens: number,
    ) {
      const u = out.usage;
      if (u) {
        const p = Number(u.promptTokens ?? 0);
        const c = Number(u.completionTokens ?? 0);
        const t = Number(u.totalTokens ?? p + c);
        totals.promptTokens += p;
        totals.completionTokens += c;
        totals.totalTokens += t;
        if (price) {
          const inPer1K =
            price.inputPer1K ??
            (price.inputPer1M != null ? price.inputPer1M / 1000 : undefined) ??
            0;
          const outPer1K =
            price.outputPer1K ??
            (price.outputPer1M != null
              ? price.outputPer1M / 1000
              : undefined) ??
            0;
          const textPromptTokens = Math.max(
            0,
            p - (price.imageInputPer1K ? imageTokens : 0),
          );
          const tokenCost =
            (textPromptTokens / 1000) * inPer1K + (c / 1000) * outPer1K;
          const perImage =
            price.imagePerImage != null
              ? price.imagePerImage
              : price.imagePer1K != null
                ? price.imagePer1K / 1000
                : undefined;
          const imageCost =
            perImage != null
              ? imageCount * perImage
              : price.imageInputPer1K
                ? (imageTokens / 1000) * price.imageInputPer1K
                : 0;
          const cost = tokenCost + imageCost;
          totals.costUSD = Number((totals.costUSD ?? 0) + cost);
          if (imageCount > 0 && price.imageInputPer1K) {
            totals.imageTokens = Number(
              (totals.imageTokens ?? 0) + imageTokens,
            );
            totals.imageCount = Number((totals.imageCount ?? 0) + imageCount);
          }
        }
        if (opts.logPerCall)
          ctx.log.info?.("[usage] call", {
            promptTokens: p,
            completionTokens: c,
            totalTokens: t,
            imageTokens:
              imageCount > 0 && price?.imageInputPer1K
                ? imageTokens
                : undefined,
            imageCount: imageCount > 0 ? imageCount : undefined,
            estCostUSD: price
              ? (() => {
                  const inPer1K =
                    price.inputPer1K ??
                    (price.inputPer1M != null ? price.inputPer1M / 1000 : 0);
                  const outPer1K =
                    price.outputPer1K ??
                    (price.outputPer1M != null ? price.outputPer1M / 1000 : 0);
                  const textPromptTokens = Math.max(
                    0,
                    p - (price?.imageInputPer1K ? imageTokens : 0),
                  );
                  const perImage =
                    price?.imagePerImage != null
                      ? price.imagePerImage
                      : price?.imagePer1K != null
                        ? price.imagePer1K / 1000
                        : undefined;
                  const tokenCost =
                    (textPromptTokens / 1000) * inPer1K + (c / 1000) * outPer1K;
                  const imageCost =
                    perImage != null
                      ? imageCount * perImage
                      : price?.imageInputPer1K
                        ? (imageTokens / 1000) * price.imageInputPer1K
                        : 0;
                  return roundUSD(tokenCost + imageCost);
                })()
              : undefined,
          });
      }
    }

    const isAsyncIterable = (val: unknown): val is AsyncIterable<ModelEvent> =>
      !!val &&
      typeof (val as AsyncIterable<ModelEvent>)[Symbol.asyncIterator] ===
        "function";

    function withUsage(
      ...args: Parameters<typeof orig>
    ): Promise<ModelResponse> | AsyncIterable<ModelEvent> {
      const reqMessages = args?.[0] as Message[] | undefined;
      const imageCount = countImageInputs(reqMessages);
      const imageTokens =
        imageCount * Number(price?.imageTokenPerImage ?? 1000);

      const out = orig(...args);
      if (isAsyncIterable(out)) {
        const iter = async function* () {
          let final: ModelResponse | undefined;
          for await (const ev of out) {
            if (ev.type === "assistant_message") {
              final = { message: ev.message };
            } else if (ev.type === "usage") {
              final = {
                message: { role: "assistant", content: "" },
                usage: ev.usage,
              };
            }
            yield ev;
          }
          if (final) applyUsage(final, imageCount, imageTokens);
        };
        return iter();
      }

      return (async () => {
        const resolved = await out;
        applyUsage(resolved, imageCount, imageTokens);
        return resolved;
      })();
    }

    (state as { _origGenerate?: typeof orig })._origGenerate = orig;
    (ctx.model as { generate: typeof orig }).generate =
      withUsage as unknown as typeof orig;

    await next();

    // Restore
    (ctx.model as { generate: typeof orig }).generate = orig;

    if (!state.usage) state.usage = {};
    state.usage.promptTokens = totals.promptTokens;
    state.usage.completionTokens = totals.completionTokens;
    state.usage.totalTokens = totals.totalTokens;
    if (price) state.usage.costUSD = roundUSD(totals.costUSD ?? 0);
    if (totals.imageTokens) state.usage.imageTokens = totals.imageTokens;
    if (totals.imageCount) state.usage.imageCount = totals.imageCount;
    ctx.log.info?.("[usage] totals", state.usage);
  };
}

function roundUSD(n: number) {
  return Math.round(n * 1e6) / 1e6;
}

function countImageInputs(msgs?: Message[]): number {
  if (!Array.isArray(msgs)) return 0;
  let count = 0;
  for (const m of msgs) {
    const c = (m as Message | { content?: unknown })?.content;
    if (Array.isArray(c)) {
      for (const part of c) {
        const partType = (part as { type?: string } | undefined)?.type;
        if (
          part &&
          typeof part === "object" &&
          (partType === "image_url" || partType === "image")
        )
          count += 1;
      }
    }
    // Convenience shapes supported by adapters (count regardless of content presence)
    const anyMsg = m as Message & {
      images?: unknown;
      image_url?: unknown;
      image?: unknown;
    };
    if (Array.isArray(anyMsg.images)) count += anyMsg.images.length;
    if (typeof anyMsg.image_url === "string") count += 1;
    if (typeof anyMsg.image === "string") count += 1;
  }
  return count;
}
