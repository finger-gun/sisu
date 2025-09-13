import type { LLM, Message, ModelResponse, GenerateOptions, Tool, ModelEvent } from '@sisu-ai/core';
import { firstConfigValue } from '@sisu-ai/core';

export interface OllamaAdapterOptions {
  model: string;
  baseUrl?: string; // default http://localhost:11434
  headers?: Record<string, string>;
}

type OllamaContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } | string };

type OllamaChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  images?: string[];
  name?: string;
  tool_call_id?: string;
  tool_calls?: any[];
};

export function ollamaAdapter(opts: OllamaAdapterOptions): LLM {
  const envBase = firstConfigValue(['OLLAMA_BASE_URL', 'BASE_URL']);
  const baseUrl = (opts.baseUrl ?? envBase ?? 'http://localhost:11434').replace(/\/$/, '');
  const modelName = `ollama:${opts.model}`;

  // Overloaded generate to match `LLM` interface
  function generate(messages: Message[], genOpts: GenerateOptions & { stream: true }): AsyncIterable<ModelEvent>;
  function generate(messages: Message[], genOpts?: Omit<GenerateOptions, 'stream'> | (GenerateOptions & { stream?: false | undefined })): Promise<ModelResponse>;
  function generate(messages: Message[], genOpts?: GenerateOptions): Promise<ModelResponse> | AsyncIterable<ModelEvent> {
    // Map messages to Ollama format; include assistant tool_calls and tool messages
    const mapped: OllamaChatMessage[] = messages.map((m: any) => {
      const base: any = { role: m.role };
      const anyM = m as Message & {
        tool_calls?: Array<{ id?: string; name?: string; arguments?: unknown }>;
        contentParts?: unknown;
        images?: unknown;
        image_urls?: unknown;
        image_url?: unknown;
        image?: unknown;
      };
      if (m.role === 'assistant' && Array.isArray(anyM.tool_calls)) {
        base.tool_calls = anyM.tool_calls.map((tc: any) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: (tc.arguments ?? {}) } }));
        const ti = buildTextAndImages(anyM);
        base.content = ti.content ?? (m.content !== undefined ? m.content : null);
        if (ti.images?.length) base.images = ti.images;
      } else if (m.role === 'tool') {
        base.content = String(m.content ?? '');
        if (m.tool_call_id) base.tool_call_id = m.tool_call_id;
        if (m.name && !m.tool_call_id) base.name = m.name;
      } else {
        const ti = buildTextAndImages(anyM);
        base.content = ti.content ?? (m.content ?? '');
        if (ti.images?.length) base.images = ti.images;
        if (m.name) base.name = m.name;
      }
      return base;
    });

    const toolsParam = (genOpts?.tools ?? []).map(toOllamaTool);
    const baseBody: any = { model: opts.model, messages: mapped };
    if (toolsParam.length) baseBody.tools = toolsParam;

    if (genOpts?.stream === true) {
      return (async function* () {
        const res = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(opts.headers ?? {}),
          },
          body: JSON.stringify({ ...baseBody, stream: true }),
        });
        if (!res.ok || !res.body) {
          const err = await res.text();
          throw new Error(`Ollama API error: ${res.status} ${res.statusText} — ${String(err).slice(0, 500)}`);
        }
        const decoder = new TextDecoder();
        let buf = '';
        let full = '';
        for await (const chunk of res.body as any) {
          const piece = typeof chunk === 'string' ? chunk : decoder.decode(chunk);
          buf += piece;
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const j = JSON.parse(line);
              if (j.done) {
                yield { type: 'assistant_message', message: { role: 'assistant', content: full } } as ModelEvent;
                return;
              }
              const token = j.message?.content;
              if (typeof token === 'string' && token) {
                full += token;
                yield { type: 'token', token } as ModelEvent;
              }
            } catch (e: unknown) {
              console.error('[DEBUG_LLM] stream_parse_error', { error: e });
            }
          }
        }
      })();
    }

    // Non-stream path
    return (async () => {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(opts.headers ?? {}),
        },
        body: JSON.stringify({ ...baseBody, stream: false }),
      });
      const raw = await res.text();
      if (!res.ok) {
        let details = raw;
        try { const j = JSON.parse(raw); details = j.error ?? j.message ?? raw; } catch (e: unknown) {
                  console.error('[DEBUG_LLM] request_error', { error: e });
                }
        throw new Error(`Ollama API error: ${res.status} ${res.statusText} — ${String(details).slice(0, 500)}`);
      }
      const data: any = raw ? JSON.parse(raw) : {};
      const choice = data?.message ?? {};
      const content = choice?.content;
      const tcs = Array.isArray(choice?.tool_calls)
        ? choice.tool_calls.map((tc: any) => ({ id: tc.id, name: tc.function?.name, arguments: safeJson(tc.function?.arguments) }))
        : undefined;
      const out: any = { role: 'assistant', content: content ?? '' };
      if (tcs) out.tool_calls = tcs;
      return { message: out };
    })();
  }

  return {
    name: modelName,
    capabilities: { functionCall: true, streaming: true },
    generate: generate as unknown as LLM['generate'],
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

// Accept OpenAI-style content parts or convenience fields and map to
// Ollama's expected shape: { content: string, images?: string[] }
function buildTextAndImages(m: unknown): { content?: string; images?: string[] } {
  if (!m || typeof m !== 'object') return {};
  const obj = m as Record<string, unknown>;
  // If content is parts, normalize
  if (Array.isArray(obj.content) || Array.isArray(obj.contentParts)) {
    const parts = Array.isArray(obj.content) ? (obj.content as unknown[]) : (obj.contentParts as unknown[]);
    const texts: string[] = [];
    const images: string[] = [];
    for (const p of parts) {
      if (typeof p === 'string') { texts.push(p); continue; }
      if (!p || typeof p !== 'object') continue;
      const po = p as Record<string, unknown>;
      const t = po.type as string | undefined;
      if (t === 'text' && typeof po.text === 'string') { texts.push(po.text); continue; }
      if (t === 'image_url') {
        const iu = po.image_url as unknown;
        if (typeof iu === 'string') images.push(iu);
        else if (iu && typeof iu === 'object' && typeof (iu as any).url === 'string') images.push(String((iu as any).url));
        continue;
      }
      if (t === 'image' && typeof (po as any).url === 'string') { images.push(String((po as any).url)); continue; }
      if (typeof (po as any).image_url === 'string') { images.push(String((po as any).image_url)); continue; }
      if (typeof (po as any).image === 'string') { images.push(String((po as any).image)); continue; }
    }
    return { content: texts.join('\n\n'), images: images.length ? images : undefined };
  }
  // Otherwise, use content string (if any) and collect convenience images
  const images: string[] = [];
  if (Array.isArray(obj.images)) images.push(...(obj.images as string[]));
  if (Array.isArray(obj.image_urls)) images.push(...(obj.image_urls as string[]));
  if (typeof obj.image_url === 'string') images.push(obj.image_url);
  if (typeof obj.image === 'string') images.push(obj.image);
  const content = typeof obj.content === 'string' ? obj.content : undefined;
  return { content, images: images.length ? images : undefined };
}
