import type { Ctx } from "./types.js";

export type Middleware<C extends Ctx = Ctx> = (
  ctx: C,
  next: () => Promise<void>,
) => void | Promise<void>;

export function compose<C extends Ctx>(stack: Middleware<C>[]) {
  if (!Array.isArray(stack)) {
    throw new TypeError("Middleware stack must be an array");
  }
  if (stack.some((fn) => typeof fn !== "function")) {
    throw new TypeError("Middleware must be composed of functions");
  }
  return (ctx: C, nextOuter?: () => Promise<void>) => {
    let index = -1;
    async function dispatch(i: number): Promise<void> {
      if (i <= index) throw new Error("next() called multiple times");
      index = i;
      const fn = stack[i] ?? nextOuter;
      if (!fn) return;
      await fn(ctx, () => dispatch(i + 1));
    }
    return dispatch(0);
  };
}
