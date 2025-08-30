import type { Ctx } from './types.js';

export type Middleware<C extends Ctx = Ctx> =
  (ctx: C, next: () => Promise<void>) => unknown | Promise<unknown>;

export function compose<C extends Ctx>(stack: Middleware<C>[]) {
  return (ctx: C, nextOuter?: () => Promise<void>) => {
    let index = -1;
    async function dispatch(i: number): Promise<void> {
      if (i <= index) throw new Error('next() called multiple times');
      index = i;
      const fn = (stack[i] as any) ?? nextOuter;
      if (!fn) return;
      await fn(ctx, () => dispatch(i + 1));
    }
    return dispatch(0);
  };
}
