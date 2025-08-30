import type { Middleware } from '@sisu-ai/core';
export type ErrorMiddleware = (err: unknown, ctx: any, next: () => Promise<void>) => Promise<void>;
export const errorBoundary = (onError: ErrorMiddleware): Middleware => async (ctx, next) => {
  try { await next(); } catch (err) { await onError(err, ctx, async () => {}); }
};
