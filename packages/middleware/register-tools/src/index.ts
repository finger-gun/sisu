import type { Middleware, Tool } from '@sisu/core';
export const registerTools = (tools: Tool[]): Middleware => async (ctx, next) => {
  for (const t of tools) ctx.tools.register(t);
  await next();
};