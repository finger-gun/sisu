import type { Middleware } from "@sisu-ai/core";
import { executeWith } from "@sisu-ai/core";

/**
 * Legacy compatibility middleware.
 * Prefer core `execute(ctx)` for new code.
 */
export const toolCalling: Middleware = async (ctx, next) => {
  await executeWith({ strategy: "single", maxRounds: 6 })(ctx, next);
};

/**
 * Legacy compatibility middleware.
 * Prefer core `execute(ctx, { strategy: "iterative" })` for new code.
 */
export const iterativeToolCalling: Middleware = async (ctx, next) => {
  await executeWith({ strategy: "iterative", maxRounds: 12 })(ctx, next);
};
