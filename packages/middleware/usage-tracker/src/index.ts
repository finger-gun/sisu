import type { Ctx, Middleware, ModelResponse } from '@sisu-ai/core';

export type PriceTable = Record<string, { inputPer1K: number; outputPer1K: number }>;

export interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUSD?: number;
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
          const cost = (p / 1000) * price.inputPer1K + (c / 1000) * price.outputPer1K;
          totals.costUSD = Number((totals.costUSD ?? 0) + cost);
        }
        if (opts.logPerCall) ctx.log.info?.('[usage] call', { promptTokens: p, completionTokens: c, totalTokens: t, estCostUSD: price ? round2((p/1000)*price.inputPer1K + (c/1000)*price.outputPer1K) : undefined });
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
    if (price) (ctx.state as any).usage.costUSD = round2(totals.costUSD ?? 0);
    ctx.log.info?.('[usage] totals', (ctx.state as any).usage);
  };
}

function round2(n: number) { return Math.round(n * 100) / 100; }
