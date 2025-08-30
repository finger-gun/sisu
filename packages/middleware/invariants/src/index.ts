import type { Ctx, Middleware } from '@sisu-ai/core';

export interface ToolCallInvariantOptions {
  strict?: boolean; // throw instead of warn
}

/**
 * Verifies that for every assistant message with tool_calls, there exists a
 * following tool message for each tool_call_id (or name fallback if no id).
 *
 * - Logs a warning with missing tool_call_ids if any are absent.
 * - With { strict: true }, throws an Error to surface mis-ordered transcripts.
 */
export function toolCallInvariant(opts: ToolCallInvariantOptions = {}): Middleware {
  const { strict = false } = opts;
  return async (ctx: Ctx, next) => {
    await next();

    const missing: Array<{ assistantIndex: number; toolCallId?: string; name?: string }> = [];
    const msgs = ctx.messages;
    for (let i = 0; i < msgs.length; i++) {
      const m: any = msgs[i];
      if (m?.role !== 'assistant') continue;
      const tcs: any[] | undefined = Array.isArray(m.tool_calls) ? m.tool_calls : undefined;
      if (!tcs || tcs.length === 0) continue;

      // For each tool call, scan forward to find a matching tool message.
      const after = msgs.slice(i + 1);
      for (const tc of tcs) {
        const id: string | undefined = tc?.id;
        const name: string | undefined = tc?.function?.name ?? tc?.name;
        const found = after.some((mm: any) => mm?.role === 'tool' && (id ? mm.tool_call_id === id : mm.name === name));
        if (!found) missing.push({ assistantIndex: i, toolCallId: id, name });
      }
    }

    if (missing.length > 0) {
      const payload = missing.map(m => ({ assistantIndex: m.assistantIndex, tool_call_id: m.toolCallId, name: m.name }));
      if (strict) {
        throw new Error(`[invariants] Missing tool responses for tool_calls: ${JSON.stringify(payload)}`);
      } else {
        ctx.log.warn?.('[invariants] Missing tool responses for tool_calls', payload);
      }
    }
  };
}
