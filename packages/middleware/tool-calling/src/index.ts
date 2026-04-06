import type { Middleware } from "@sisu-ai/core";
import { executeWith } from "@sisu-ai/core";

/**
 * Legacy compatibility middleware.
 *
 * @deprecated Prefer core execution middleware from `@sisu-ai/core`:
 * - `.use(execute)` or `.use(executeWith(opts))`
 * - `.use(executeStream)` or `.use(executeStream(opts))`
 *
 * Migration guide: https://github.com/finger-gun/sisu/tree/main/packages/core#execution-apis-recommended
 */
export const toolCalling: Middleware = async (ctx, next) => {
  await executeWith({ strategy: "single", maxRounds: 6 })(ctx, next);
};

/**
 * Legacy compatibility middleware.
 *
 * @deprecated Prefer `.use(execute)` (iterative by default) or
 * `.use(executeWith({ strategy: "iterative" }))` from `@sisu-ai/core`.
 *
 * Migration guide: https://github.com/finger-gun/sisu/tree/main/packages/core#execution-apis-recommended
 */
export const iterativeToolCalling: Middleware = async (ctx, next) => {
  await executeWith({ strategy: "iterative", maxRounds: 12 })(ctx, next);
};
