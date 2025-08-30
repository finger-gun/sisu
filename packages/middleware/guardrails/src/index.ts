import type { Middleware } from '@sisu-ai/core';
export const withGuardrails = (policy: (msg: string) => Promise<string | null>): Middleware =>
  async (ctx, next) => {
    const violation = await policy(ctx.input ?? '');
    if (violation) { ctx.messages.push({ role: 'assistant', content: violation }); return; }
    await next();
  };
