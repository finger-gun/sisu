import type { Ctx, LLM, Message, Middleware } from '@sisu-ai/core';

export interface ContextCompressorOptions {
  maxChars?: number;         // threshold to trigger compression
  keepRecent?: number;       // number of recent messages to keep verbatim
  summaryMaxChars?: number;  // clamp the summary size
  recentClampChars?: number; // clamp size of recent large messages (e.g., tool outputs)
}

export const contextCompressor = (opts: ContextCompressorOptions = {}): Middleware => {
  const maxChars = opts.maxChars ?? 140_000;
  const keepRecent = opts.keepRecent ?? 8;
  const summaryMaxChars = opts.summaryMaxChars ?? 8_000;
  const recentClampChars = opts.recentClampChars ?? 8_000;
  return async (ctx, next) => {
    const original = ctx.model;
    ctx.model = wrapModelWithCompression(original, { maxChars, keepRecent, summaryMaxChars, recentClampChars }, ctx);
    await next();
  };
};

function wrapModelWithCompression(model: LLM, cfg: Required<ContextCompressorOptions>, ctx: Ctx): LLM {
  const origGenerate = model.generate.bind(model);
  return {
    ...model,
    async generate(messages, genOpts) {
      try {
        // Only compress when not already summarizing and context seems large
        if (!ctx.state.__compressing && approxChars(messages) > cfg.maxChars) {
          ctx.log.info?.('[context-compressor] compressing conversation context');
          ctx.state.__compressing = true;
          try {
            const compressed = await compressMessages(messages, cfg, ctx, origGenerate);
            messages = compressed;
          } finally {
            delete ctx.state.__compressing;
          }
        }
        // Always clamp oversized recent tool outputs to avoid huge bodies
        messages = clampRecent(messages, cfg, ctx);
      } catch (e) {
        ctx.log.warn?.('[context-compressor] failed to compress; proceeding uncompressed', e);
      }
      return await origGenerate(messages, genOpts as any) as any;
    }
  };
}

function approxChars(messages: Message[]): number {
  let n = 0;
  for (const m of messages) {
    const c: any = (m as any).content;
    if (typeof c === 'string') n += c.length; else if (Array.isArray(c)) n += JSON.stringify(c).length;
  }
  return n;
}

async function compressMessages(messages: Message[], cfg: Required<ContextCompressorOptions>, ctx: Ctx, gen: LLM['generate']): Promise<Message[]> {
  if (messages.length <= cfg.keepRecent + 1) return messages;
  let cut = Math.max(1, messages.length - cfg.keepRecent);

  // Don’t split a tool-call group: if tail starts with tool messages, include the preceding
  // assistant that requested tool_calls in the tail as well.
  if (messages[cut] && (messages[cut] as any).role === 'tool') {
    const anchor = findPrevAssistantWithToolCalls(messages, cut - 1);
    if (anchor >= 0) {
      cut = anchor; // include the assistant-with-tool_calls in the tail
    } else {
      // As a last resort, advance cut forward past any leading tool messages in tail
      while (cut < messages.length && (messages[cut] as any).role === 'tool') cut++;
    }
  }

  const head = messages.slice(0, cut);
  const tail = messages.slice(cut);

  // Build a compression prompt
  const headText = sliceAndFlatten(head, cfg.summaryMaxChars * 5);
  const prompt = [
    { role: 'system', content: 'You are a compression assistant. Summarize the following conversation and tool outputs into a compact bullet list of established facts and extracted citations (URLs). Keep it under the specified character budget. Do not invent facts.' },
    { role: 'user', content: `Character budget: ${cfg.summaryMaxChars}. Include a section "Citations:" listing unique URLs.\n\nConversation to compress:\n${headText}` },
  ] as Message[];

  const res: any = await gen(prompt, { toolChoice: 'none', signal: ctx.signal });
  const summary = String(res?.message?.content ?? '').slice(0, cfg.summaryMaxChars);
  const summaryMsg: Message = { role: 'assistant', content: `[Summary of earlier turns]\n${summary}` };
  return [messages[0], summaryMsg, ...tail];
}

function sliceAndFlatten(msgs: Message[], max: number): string {
  const parts: string[] = [];
  for (const m of msgs) {
    const role = m.role;
    const c: any = (m as any).content;
    let text = '';
    if (typeof c === 'string') text = c;
    else if (Array.isArray(c)) text = JSON.stringify(c);
    else text = String(c ?? '');
    parts.push(`--- ${role} ---\n${text}`);
    const joined = parts.join('\n');
    if (joined.length > max) return joined.slice(0, max);
  }
  return parts.join('\n');
}

function clampRecent(messages: Message[], cfg: Required<ContextCompressorOptions>, ctx: Ctx): Message[] {
  // Create shallow copies to avoid mutating upstream state
  const out = messages.map(m => ({ ...m }));
  const limit = cfg.recentClampChars;
  for (let i = Math.max(0, out.length - (cfg.keepRecent + 4)); i < out.length; i++) {
    const m: any = out[i];
    const c = m.content;
    if (typeof c !== 'string') continue;
    if (m.role === 'tool') {
      const clamped = clampToolContentString(c, limit);
      if (clamped !== c) {
        m.content = clamped;
        ctx.log.debug?.('[context-compressor] clamped tool message', { idx: i, before: c.length, after: clamped.length });
      }
    } else if (c.length > limit * 2) {
      m.content = c.slice(0, limit * 2);
      ctx.log.debug?.('[context-compressor] truncated long message', { idx: i, before: c.length, after: m.content.length });
    }
  }
  return out;
}

function clampToolContentString(s: string, limit: number): string {
  try {
    const obj = JSON.parse(s);
    // Remove heavy fields commonly present in webFetch
    if (obj && typeof obj === 'object') {
      if (typeof obj.html === 'string') delete obj.html;
      if (typeof obj.text === 'string') {
        if (obj.text.length > limit) obj.text = String(obj.text).slice(0, limit);
      }
      // Recursively clamp nested arrays/objects
      return JSON.stringify(clampDeep(obj, limit));
    }
  } catch {}
  return s.length > limit ? s.slice(0, limit) : s;
}

function clampDeep(v: any, limit: number): any {
  if (!v || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.slice(0, 50).map(x => clampDeep(x, limit));
  const out: any = {};
  for (const [k, val] of Object.entries(v)) {
    if (k === 'html') continue; // drop
    if (typeof val === 'string') out[k] = val.length > limit ? val.slice(0, limit) : val;
    else out[k] = clampDeep(val, limit);
  }
  return out;
}

function findPrevAssistantWithToolCalls(messages: Message[], start: number): number {
  for (let i = start; i >= 0; i--) {
    const m: any = messages[i];
    if (m?.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) return i;
  }
  return -1;
}
