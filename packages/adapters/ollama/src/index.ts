import type { LLM, Message, ModelResponse, GenerateOptions, Tool } from '@sisu/core';

export interface OllamaAdapterOptions {
  model: string;
  baseUrl?: string; // default http://localhost:11434
  headers?: Record<string, string>;
}

type OllamaChatMessage = { role: 'system'|'user'|'assistant'|'tool'; content?: string|null; name?: string; tool_call_id?: string; tool_calls?: any[] };

export function ollamaAdapter(opts: OllamaAdapterOptions): LLM {
  const baseUrl = (opts.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '');
  const modelName = `ollama:${opts.model}`;

  return {
    name: modelName,
    capabilities: { functionCall: true, streaming: false },
    async generate(messages: Message[], genOpts?: GenerateOptions): Promise<ModelResponse> {
      // Map messages to Ollama format; include assistant tool_calls and tool messages
      const mapped: OllamaChatMessage[] = messages.map((m: any) => {
        const base: any = { role: m.role };
        if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
          base.tool_calls = m.tool_calls.map((tc: any) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: (tc.arguments ?? {}) } }));
          base.content = m.content ? String(m.content) : null;
        } else if (m.role === 'tool') {
          base.content = String(m.content ?? '');
          if (m.tool_call_id) base.tool_call_id = m.tool_call_id;
          if (m.name && !m.tool_call_id) base.name = m.name;
        } else {
          base.content = String(m.content ?? '');
        }
        return base;
      });

      const toolsParam = (genOpts?.tools ?? []).map(toOllamaTool);
      const body: any = { model: opts.model, messages: mapped, stream: false };
      if (toolsParam.length) body.tools = toolsParam;
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(opts.headers ?? {}),
        },
        body: JSON.stringify(body),
      });
      const raw = await res.text();
      if (!res.ok) {
        let details = raw;
        try { const j = JSON.parse(raw); details = j.error ?? j.message ?? raw; } catch {}
        throw new Error(`Ollama API error: ${res.status} ${res.statusText} — ${String(details).slice(0, 500)}`);
      }
      const data: any = raw ? JSON.parse(raw) : {};
      // /api/chat response example (non-stream): { message: { role:'assistant', content:'...', tool_calls?: [...] }, done: true }
      const choice = data?.message ?? {};
      const content = choice?.content ?? '';
      const tcs = Array.isArray(choice?.tool_calls)
        ? choice.tool_calls.map((tc: any) => ({ id: tc.id, name: tc.function?.name, arguments: safeJson(tc.function?.arguments) }))
        : undefined;
      const out: any = { role: 'assistant', content: String(content ?? '') };
      if (tcs) out.tool_calls = tcs;
      return { message: out };
    },
  };
}

function toOllamaTool(tool: Tool) {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: toJsonSchema((tool as any).schema),
    },
  } as const;
}

function toJsonSchema(schema: any): any {
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
    return { type: 'object', properties: props, ...(required.length ? { required } : {}) };
  }
  return { type: 'object' };
}

function safeJson(s: any) {
  if (typeof s !== 'string') return s;
  try { return JSON.parse(s); } catch { return s; }
}
