import type { Middleware, Message } from '@sisu-ai/core';
export const reactToolLoop = (): Middleware => {
  return async (ctx, next) => {
    await next(); // upstream prep
    const res = await ctx.model.generate(ctx.messages, { toolChoice: 'none', signal: ctx.signal }) as any;
    const msg = res.message;
    const content = msg?.content ?? '';
    const toolMatch = content.match(/Action:\s*(\w+)/i);
    const inputMatch = content.match(/Action Input:\s*([\s\S]*)/i);
    if (toolMatch && inputMatch) {
      const toolName = toolMatch[1];
      ctx.log.info?.('[react] parsed tool action', { toolName });
      const tool = ctx.tools.get(toolName);
      if (!tool) throw new Error('Unknown tool: ' + toolName);
      let args: any = inputMatch[1].trim();
      try { args = JSON.parse(args); } catch {}
      ctx.log.debug?.('[react] invoking tool', { toolName, args });
      const result = await tool.handler(args, ctx);
      // ReAct pattern: feed tool output back as a user message (not provider-specific tool role)
      const rendered = typeof result === 'string' ? result : JSON.stringify(result);
      ctx.messages.push({ role: 'user', content: `Observation (${toolName}): ${rendered}` } as Message);
      const res2 = await ctx.model.generate(ctx.messages, { toolChoice: 'none', signal: ctx.signal }) as any;
      ctx.log.debug?.('[react] got assistant follow-up');
      ctx.messages.push(res2.message);
    } else {
      ctx.log.debug?.('[react] no tool action parsed; appending assistant message');
      if (msg) ctx.messages.push(msg);
    }
  };
};
