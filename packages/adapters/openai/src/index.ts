import type { LLM, Message, ModelResponse, GenerateOptions, Tool } from '@sisu/core';
type OpenAIChatMessage = {
  role: 'system'|'user'|'assistant'|'tool';
  content?: string | null;
  name?: string;
  tool_calls?: Array<{ id?: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};
export interface OpenAIAdapterOptions { model: string; apiKey?: string; baseUrl?: string; }
export function openAIAdapter(opts: OpenAIAdapterOptions): LLM {
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY ?? '';
  const envBase = process.env.OPENAI_BASE_URL || process.env.BASE_URL;
  const baseUrl = (opts.baseUrl ?? envBase ?? 'https://api.openai.com').replace(/\/$/, '');
  if (!apiKey) throw new Error('[openAIAdapter] Missing OPENAI_API_KEY — set it in your environment or pass { apiKey }');
  const DEBUG = String(process.env.DEBUG_LLM || '').toLowerCase() === 'true' || process.env.DEBUG_LLM === '1';
  return {
    name: 'openai:' + opts.model,
    capabilities: { functionCall: true, streaming: false },
    async generate(messages: Message[], genOpts?: GenerateOptions): Promise<ModelResponse> {
      const toolsParam = (genOpts?.tools ?? []).map(t => toOpenAiTool(t));
      const tool_choice = normalizeToolChoice(genOpts?.toolChoice);
      const body: any = {
        model: opts.model,
        messages: messages.map(m => toOpenAiMessage(m)),
        temperature: genOpts?.temperature ?? 0.2,
        ...(toolsParam.length ? { tools: toolsParam } : {}),
        ...(tool_choice !== undefined ? { tool_choice } : {}),
        ...(genOpts?.parallelToolCalls !== undefined ? { parallel_tool_calls: Boolean(genOpts.parallelToolCalls) } : {}),
      };
      const url = `${baseUrl}/v1/chat/completions`;
      if (DEBUG) {
        try {
          // Print a redacted/summarized payload for troubleshooting
          const dbgMsgs = (body.messages as any[]).map((m) => ({
            role: m.role,
            name: m.name,
            tool_call_id: m.tool_call_id,
            tool_calls: Array.isArray(m.tool_calls) ? m.tool_calls.map((tc: any) => ({ id: tc.id, function: { name: tc.function?.name, arguments: summarize(tc.function?.arguments) } })) : undefined,
            content: typeof m.content === 'string' ? summarize(m.content) : m.content === null ? null : typeof m.content,
          }));
          // eslint-disable-next-line no-console
          console.error('[DEBUG_LLM] request', { url, headers: { Authorization: 'Bearer ***', 'Content-Type': 'application/json', Accept: 'application/json' }, body: { ...body, messages: dbgMsgs } });
        } catch {}
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
      });
      const raw = await res.text();
      if (!res.ok) {
        let details = raw;
        try { const j = JSON.parse(raw); details = j.error?.message ?? raw; } catch {}
        if (DEBUG) {
          // eslint-disable-next-line no-console
          console.error('[DEBUG_LLM] response_error', { status: res.status, statusText: res.statusText, body: summarize(String(raw)) });
        }
        throw new Error(`OpenAI API error: ${res.status} ${res.statusText} — ${String(details).slice(0, 500)}`);
      }
      const data: any = raw ? JSON.parse(raw) : {};
      const choice = data.choices?.[0];
      const toolCalls = Array.isArray(choice?.message?.tool_calls)
        ? (choice.message.tool_calls as any[]).map(tc => ({ id: tc.id, name: tc.function?.name, arguments: safeJson(tc.function?.arguments) }))
        : choice?.message?.function_call
          ? [{ name: choice.message.function_call.name, arguments: safeJson(choice.message.function_call.arguments) }]
          : undefined;
      const msg: Message = { role: choice.message.role, content: choice.message.content ?? '' } as any;
      if (toolCalls) (msg as any).tool_calls = toolCalls;
      const usage = mapUsage(data?.usage);
      return { message: msg, ...(usage ? { usage } : {}) };
    }
  };
}

function toOpenAiTool(tool: Tool) {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: toJsonSchema(tool.schema),
    }
  };
}

function toJsonSchema(schema: any): any {
  // Minimal zod-ish to JSON Schema converter for common primitives
  if (!schema) return { type: 'object' };
  const t = schema?._def?.typeName;
  if (t === 'ZodString') return { type: 'string' };
  if (t === 'ZodNumber') return { type: 'number' };
  if (t === 'ZodBoolean') return { type: 'boolean' };
  if (t === 'ZodArray') return { type: 'array', items: toJsonSchema(schema._def?.type) };
  if (t === 'ZodOptional') return toJsonSchema(schema._def?.innerType);
  if (t === 'ZodObject') {
    const shape = typeof schema._def?.shape === 'function' ? schema._def.shape() : schema._def?.shape;
    const props: Record<string, any> = {};
    const required: string[] = [];
    for (const [key, val] of Object.entries(shape ?? {})) {
      props[key] = toJsonSchema((val as any));
      const innerTypeName = (val as any)?._def?.typeName;
      if (innerTypeName !== 'ZodOptional' && innerTypeName !== 'ZodDefault') required.push(key);
    }
    return { type: 'object', properties: props, ...(required.length ? { required } : {}), additionalProperties: false };
  }
  // Fallback
  return { type: 'object' };
}

function safeJson(s: any) {
  if (typeof s !== 'string') return s;
  try { return JSON.parse(s); } catch { return s; }
}
function normalizeToolChoice(choice: GenerateOptions['toolChoice']) {
  if (!choice) return undefined;
  if (choice === 'auto' || choice === 'none') return choice;
  // assume specific function name
  return { type: 'function', function: { name: choice } } as const;
}

function toOpenAiMessage(m: Message): OpenAIChatMessage {
  const base: OpenAIChatMessage = { role: m.role as any };
  if (m.role === 'tool') {
    const anyM = m as any;
    return {
      ...base,
      content: String(anyM.content ?? ''),
      ...(anyM.tool_call_id ? { tool_call_id: anyM.tool_call_id } : {}),
      ...(anyM.name && !anyM.tool_call_id ? { name: anyM.name } : {}),
    };
  }
  if (m.role === 'assistant') {
    const anyM = m as any;
    const calls = Array.isArray(anyM.tool_calls)
      ? anyM.tool_calls.map((tc: any) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.arguments ?? {}) } }))
      : undefined;
    return {
      ...base,
      // If this assistant message only carries tool_calls, providers often prefer null over empty string.
      content: (calls && (m.content === undefined || m.content === '')) ? null : (m.content ?? ''),
      ...(calls ? { tool_calls: calls } : {}),
    };
  }
  return { ...base, content: m.content ?? '' , ...(m.name ? { name: m.name } : {}) };
}

function summarize(v: any, max = 300): any {
  if (typeof v !== 'string') return v;
  return v.length > max ? v.slice(0, max) + '…' : v;
}

function mapUsage(u: any) {
  if (!u) return undefined;
  const prompt = u.prompt_tokens ?? u.input_tokens;
  const completion = u.completion_tokens ?? u.output_tokens;
  const total = u.total_tokens ?? (Number(prompt ?? 0) + Number(completion ?? 0));
  return {
    promptTokens: typeof prompt === 'number' ? prompt : undefined,
    completionTokens: typeof completion === 'number' ? completion : undefined,
    totalTokens: typeof total === 'number' ? total : undefined,
  } as ModelResponse['usage'];
}
