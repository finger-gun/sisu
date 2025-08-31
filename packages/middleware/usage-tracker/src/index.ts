import type { Ctx, Middleware, ModelResponse } from '@sisu-ai/core';

export type PriceTable = Record<string, {
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
}>;

export interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUSD?: number;
  imageTokens?: number;
  imageCount?: number;
}

export function usageTracker(prices: PriceTable, opts: { logPerCall?: boolean } = {}): Middleware {
  return async (ctx, next) => {
    // Wrap model.generate to intercept responses
    const orig = ctx.model.generate.bind(ctx.model);
    const price = prices[ctx.model.name] ?? prices['*'];

    const totals: UsageTotals = {
      promptTokens: Number((ctx.state as any)?.usage?.promptTokens ?? 0),
      completionTokens: Number((ctx.state as any)?.usage?.completionTokens ?? 0),
      totalTokens: Number((ctx.state as any)?.usage?.totalTokens ?? 0),
      costUSD: Number((ctx.state as any)?.usage?.costUSD ?? 0),
    };

    async function withUsage(...args: Parameters<typeof orig>): Promise<ModelResponse> {
      // Inspect request messages to estimate image inputs
      const reqMessages = args?.[0] as any[] | undefined;
      const imageCount = countImageInputs(reqMessages);
      const imageTokens = imageCount * Number(price?.imageTokenPerImage ?? 1000);

      const out = await orig(...args) as ModelResponse;
      const u = out.usage;
      if (u) {
        const p = Number(u.promptTokens ?? 0);
        const c = Number(u.completionTokens ?? 0);
        const t = Number(u.totalTokens ?? (p + c));
        totals.promptTokens += p;
        totals.completionTokens += c;
        totals.totalTokens += t;
        if (price) {
          // Resolve effective per-1K pricing from provided per-1M or per-1K fields
          const inPer1K = price.inputPer1K ?? (price.inputPer1M != null ? price.inputPer1M / 1000 : undefined) ?? 0;
          const outPer1K = price.outputPer1K ?? (price.outputPer1M != null ? price.outputPer1M / 1000 : undefined) ?? 0;

          // Base text+completion token cost
          const textPromptTokens = Math.max(0, p - (price.imageInputPer1K ? imageTokens : 0));
          const tokenCost = (textPromptTokens / 1000) * inPer1K + (c / 1000) * outPer1K;
          // Image cost (prefer per-image if provided)
          const perImage = price.imagePerImage != null ? price.imagePerImage : (price.imagePer1K != null ? price.imagePer1K / 1000 : undefined);
          const imageCost = perImage != null
            ? imageCount * perImage
            : price.imageInputPer1K
              ? (imageTokens / 1000) * price.imageInputPer1K
              : 0;
          const cost = tokenCost + imageCost;
          totals.costUSD = Number((totals.costUSD ?? 0) + cost);
          if (imageCount > 0 && price.imageInputPer1K) {
            totals.imageTokens = Number((totals.imageTokens ?? 0) + imageTokens);
            totals.imageCount = Number((totals.imageCount ?? 0) + imageCount);
          }
        }
        if (opts.logPerCall) ctx.log.info?.('[usage] call', {
          promptTokens: p, completionTokens: c, totalTokens: t,
          imageTokens: (imageCount > 0 && price?.imageInputPer1K) ? imageTokens : undefined,
          imageCount: imageCount > 0 ? imageCount : undefined,
          estCostUSD: price ? (() => {
            const inPer1K = price.inputPer1K ?? (price.inputPer1M != null ? price.inputPer1M / 1000 : 0);
            const outPer1K = price.outputPer1K ?? (price.outputPer1M != null ? price.outputPer1M / 1000 : 0);
            const textPromptTokens = Math.max(0, p - (price?.imageInputPer1K ? imageTokens : 0));
            const perImage = price?.imagePerImage != null ? price.imagePerImage : (price?.imagePer1K != null ? price.imagePer1K / 1000 : undefined);
            const tokenCost = (textPromptTokens/1000) * inPer1K + (c/1000) * outPer1K;
            const imageCost = perImage != null ? (imageCount * perImage) : (price?.imageInputPer1K ? (imageTokens/1000) * price.imageInputPer1K : 0);
            return roundUSD(tokenCost + imageCost);
          })() : undefined,
        });
      }
      return out;
    }

    (ctx.state as any)._origGenerate = orig;
    (ctx.model as any).generate = withUsage;

    await next();

    // Restore
    (ctx.model as any).generate = orig;

    if (!(ctx.state as any).usage) (ctx.state as any).usage = {};
    (ctx.state as any).usage.promptTokens = totals.promptTokens;
    (ctx.state as any).usage.completionTokens = totals.completionTokens;
    (ctx.state as any).usage.totalTokens = totals.totalTokens;
    if (price) (ctx.state as any).usage.costUSD = roundUSD(totals.costUSD ?? 0);
    if (totals.imageTokens) (ctx.state as any).usage.imageTokens = totals.imageTokens;
    if (totals.imageCount) (ctx.state as any).usage.imageCount = totals.imageCount;
    ctx.log.info?.('[usage] totals', (ctx.state as any).usage);
  };
}

function roundUSD(n: number) { return Math.round(n * 1e6) / 1e6; }

function countImageInputs(msgs?: any[]): number {
  if (!Array.isArray(msgs)) return 0;
  let count = 0;
  for (const m of msgs) {
    const c = (m as any)?.content;
    if (Array.isArray(c)) {
      for (const part of c) {
        if (part && typeof part === 'object' && (part.type === 'image_url' || part.type === 'image')) count += 1;
      }
    }
    // Convenience shapes supported by adapters (count regardless of content presence)
    if (Array.isArray((m as any)?.images)) count += (m as any).images.length;
    if (typeof (m as any)?.image_url === 'string') count += 1;
    if (typeof (m as any)?.image === 'string') count += 1;
  }
  return count;
}
