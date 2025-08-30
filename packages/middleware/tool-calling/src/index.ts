import type { Middleware, Message } from '@sisu-ai/core';
export const toolCalling: Middleware = async (ctx, next) => {
  await next();
  for (let i = 0; i < 6; i++) {
    ctx.log.debug?.('[tool-calling] iteration start', { i, messages: ctx.messages.length });
    const toolList = ctx.tools.list();
    const allowTools = i === 0 ? 'auto' : 'none';
    const genOpts: any = { toolChoice: allowTools, signal: ctx.signal };
    if (allowTools !== 'none') { genOpts.tools = toolList; genOpts.parallelToolCalls = false; }
    const out = await ctx.model.generate(ctx.messages, genOpts) as any;
    const msg = out.message as Message;
    const toolCalls = (msg as any).tool_calls as Array<{ id?: string, name: string, arguments: any }> | undefined;
    if (toolCalls && toolCalls.length > 0) {
      // Important: include the assistant message that requested tools so tool_call_id has a valid anchor.
      ctx.messages.push(msg);
      ctx.log.info?.('[tool-calling] model requested tools', toolCalls.map(tc => ({ id: tc.id, name: tc.name, hasArgs: typeof tc.arguments !== 'undefined' })));

      // Execute each unique (name,args) once, but reply to every tool_call_id.
      const cache = new Map<string, any>();
      const keyOf = (tc: { name: string; arguments: any }) => `${tc.name}:${safeStableStringify(tc.arguments)}`;
      const lastArgsByName = new Map<string, any>();

      // Pre-pass: fill missing arguments from last seen arguments of same tool name (provider quirk)
      const resolvedCalls = toolCalls.map((tc) => {
        if (typeof tc.arguments === 'undefined' && lastArgsByName.has(tc.name)) {
          return { ...tc, arguments: lastArgsByName.get(tc.name) };
        }
        return tc;
      });

      for (const call of resolvedCalls) {
        const tool = ctx.tools.get(call.name);
        if (!tool) throw new Error('Unknown tool: ' + call.name);

        const key = keyOf(call);
        let result = cache.get(key);
        if (result === undefined) {
          const args = tool.schema?.parse ? tool.schema.parse(call.arguments) : call.arguments;
          ctx.log.debug?.('[tool-calling] invoking tool', { name: call.name, id: call.id, args });
          result = await tool.handler(args, ctx);
          cache.set(key, result);
          lastArgsByName.set(call.name, args);
        } else {
          ctx.log.debug?.('[tool-calling] reusing cached tool result for duplicate call', { name: call.name, id: call.id });
        }

        // Prefer tool_call_id when available (tools API)
        const toolMsg: any = { role: 'tool', content: JSON.stringify(result) };
        if (call.id) toolMsg.tool_call_id = call.id; else toolMsg.name = call.name;
        ctx.messages.push(toolMsg as Message);
        ctx.log.debug?.('[tool-calling] tool result appended', { name: call.name, id: call.id, contentBytes: (toolMsg.content as string).length });
      }
      continue;
    } else {
      ctx.log.info?.('[tool-calling] no tool calls; appending assistant message');
      ctx.messages.push(msg);
      break;
    }
  }
};

function safeStableStringify(v: any): string {
  try {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const keys = Object.keys(v).sort();
      const obj: any = {};
      for (const k of keys) obj[k] = v[k];
      return JSON.stringify(obj);
    }
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
