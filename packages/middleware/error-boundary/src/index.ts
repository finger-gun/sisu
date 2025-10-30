import type { Middleware } from '@sisu-ai/core';
import { isSisuError, getErrorDetails } from '@sisu-ai/core';

export type ErrorMiddleware = (err: unknown, ctx: any, next: () => Promise<void>) => Promise<void>;

/**
 * Error boundary middleware that catches and handles errors in the middleware stack.
 * Automatically logs structured error information for SisuError instances.
 */
export const errorBoundary = (onError: ErrorMiddleware): Middleware => async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    // Log structured error details for better debugging
    const details = getErrorDetails(err);
    ctx.log.error('[error-boundary] Error caught:', details);
    
    // Save error details to context state for trace viewer and other middleware
    if (!ctx.state._error) {
      ctx.state._error = details;
    }
    
    await onError(err, ctx, async () => {});
  }
};

/**
 * Simple error boundary that logs errors and continues.
 * Useful for development and debugging.
 */
export const logErrors = (): Middleware => errorBoundary(async (err, ctx) => {
  const details = getErrorDetails(err);
  ctx.log.error('[error-boundary] Unhandled error:', details);
});

/**
 * Error boundary that rethrows after logging.
 * Useful when you want to log but still propagate the error.
 */
export const logAndRethrow = (): Middleware => errorBoundary(async (err, ctx) => {
  const details = getErrorDetails(err);
  ctx.log.error('[error-boundary] Error (rethrowing):', details);
  throw err;
});
