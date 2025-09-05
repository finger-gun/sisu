import type { Middleware, Tool } from '@sisu-ai/core';
export const registerTools = (tools: Tool[]): Middleware => async (ctx, next) => {
  for (const t of tools) {
    ctx.log.debug(`Registering tool: ${t.name}`, { tool: t.name, description: t.description });
    ctx.tools.register(t);
  }
  await next();
};
