import type { LLM, Message, ModelResponse, GenerateOptions, Tool, ModelEvent } from '@sisu-ai/core';
import { firstConfigValue } from '@sisu-ai/core';

// Small typed helpers for parsing OpenAI shapes without using `any`
type OpenAITool = { type: 'function'; function: { name: string; description?: string; parameters?: Record<string, unknown> } };
type OpenAIStreamChunk = { choices?: Array<{ delta?: { content?: string } }> };
type OpenAIMessageShape = {
  role?: string;
  content?: string | null;
  tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
  function_call?: { name: string; arguments: string };
};
type OpenAIResponse = { choices?: Array<{ message?: OpenAIMessageShape }>; usage?: Record<string, unknown> };
type OpenAIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } | string };

type OpenAIChatMessage = {
  role: 'system'|'user'|'assistant'|'tool';
  content?: string | OpenAIContentPart[] | null;
  name?: string;
  tool_calls?: Array<{ id?: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};
type ToolCall = { id?: string; function?: { name?: string; arguments?: string } };
type ZodLike = { _def?: { typeName?: string; type?: unknown; innerType?: unknown; shape?: unknown } };
export interface OpenAIAdapterOptions { model: string; apiKey?: string; baseUrl?: string; responseModel?: string; }
export function openAIAdapter(opts: OpenAIAdapterOptions): LLM {
  const apiKey = opts.apiKey ?? firstConfigValue(['OPENAI_API_KEY','API_KEY']) ?? '';
  const envBase = firstConfigValue(['OPENAI_BASE_URL','BASE_URL']);
  const baseUrl = (opts.baseUrl ?? envBase ?? 'https://api.openai.com').replace(/\/$/, '');
  if (!apiKey) throw new Error('[openAIAdapter] Missing OPENAI_API_KEY or API_KEY — set it in your environment or pass { apiKey }');
  const DEBUG = String(process.env.DEBUG_LLM || '').toLowerCase() === 'true' || process.env.DEBUG_LLM === '1';
  return {
    name: 'openai:' + opts.model,
    capabilities: { functionCall: true, streaming: true },
    // Non-standard metadata for tools that may target other OpenAI surfaces (e.g., Responses API)
    ...(opts.responseModel ? { meta: { responseModel: opts.responseModel } } : {}),
    async generate(messages: Message[], genOpts?: GenerateOptions): Promise<ModelResponse | AsyncIterable<ModelEvent>> {
      const toolsParam = (genOpts?.tools ?? []).map(t => toOpenAiTool(t));
      const tool_choice = normalizeToolChoice(genOpts?.toolChoice);
  const body: Record<string, unknown> = {
        model: opts.model,
        messages: messages.map(m => toOpenAiMessage(m)),
        temperature: genOpts?.temperature ?? 0.2,
        ...(toolsParam.length ? { tools: toolsParam } : {}),
        // Some providers reject tool_choice when tools are not present; include only when tools exist
        ...((toolsParam.length && tool_choice !== undefined) ? { tool_choice } : {}),
        ...(genOpts?.parallelToolCalls !== undefined ? { parallel_tool_calls: Boolean(genOpts.parallelToolCalls) } : {}),
        ...(genOpts?.stream ? { stream: true } : {}),
      };
      const url = `${baseUrl}/v1/chat/completions`;
      if (DEBUG) {
        try {
          // Print a redacted/summarized payload for troubleshooting
          const dbgMsgs = (body.messages as OpenAIChatMessage[]).map((m) => {
            const toolCalls = Array.isArray(m.tool_calls)
              ? (m.tool_calls as Array<ToolCall>).map((tc) => ({ id: tc.id, function: { name: tc.function?.name, arguments: summarize(tc.function?.arguments) } }))
              : undefined;
            return {
              role: m.role,
              name: m.name,
              tool_call_id: m.tool_call_id,
              tool_calls: toolCalls,
              content: Array.isArray(m.content)
                ? `[${m.content.length} parts]`
                : (typeof m.content === 'string' ? summarize(m.content) : m.content === null ? null : typeof m.content),
            };
          });
          // eslint-disable-next-line no-console
          console.error('[DEBUG_LLM] request', { url, headers: { Authorization: 'Bearer ***', 'Content-Type': 'application/json', Accept: 'application/json' }, body: { ...body, messages: dbgMsgs } });
        } catch (e) { void e; }
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
      if (genOpts?.stream) {
        if (!res.ok || !res.body) {
          const err = await res.text();
          throw new Error(`OpenAI API error: ${res.status} ${res.statusText} — ${String(err).slice(0,500)}`);
        }
        const iter = async function*() {
          const decoder = new TextDecoder();
          let buf = '';
          let full = '';
          for await (const chunk of res.body as AsyncIterable<Uint8Array | string>) {
            const piece = typeof chunk === 'string' ? chunk : decoder.decode(chunk as Uint8Array);
            buf += piece;
            const lines = buf.split('\n');
            buf = lines.pop() ?? '';
            for (const line of lines) {
              const m = line.match(/^data:\s*(.*)/);
              if (!m) continue;
              const data = m[1].trim();
              if (data === '' || data === '[DONE]') {
                if (data === '[DONE]') {
                  yield { type: 'assistant_message', message: { role: 'assistant', content: full } } as ModelEvent;
                  return;
                }
                continue;
              }
              try {
                const j = JSON.parse(data);
                const delta = (j as OpenAIStreamChunk)?.choices?.[0]?.delta;
                const t = delta?.content;
                if (typeof t === 'string') {
                  full += t;
                  yield { type: 'token', token: t } as ModelEvent;
                }
              } catch (e) { void e; }
            }
          }
        };
        return iter();
      }
      const raw = await res.text();
      if (!res.ok) {
        let details = raw;
        try {
          const j = JSON.parse(raw) as Record<string, unknown>;
          const maybeError = j.error as Record<string, unknown> | undefined;
          const msg = maybeError?.message;
          if (typeof msg === 'string') details = msg;
        } catch (e) { void e; }
        if (DEBUG) {
          // eslint-disable-next-line no-console
          console.error('[DEBUG_LLM] response_error', { status: res.status, statusText: res.statusText, body: summarize(String(raw)) });
        }
        throw new Error(`OpenAI API error: ${res.status} ${res.statusText} — ${String(details).slice(0, 500)}`);
      }
      const data = raw ? JSON.parse(raw) as OpenAIResponse : {} as Record<string, unknown>;
      const choice = (data as OpenAIResponse).choices?.[0];
      const toolCalls = (() => {
        const msgShape = choice?.message;
        if (Array.isArray(msgShape?.tool_calls)) {
          return (msgShape.tool_calls as ToolCall[]).map(tc => ({ id: tc.id, name: tc.function?.name, arguments: safeJson(tc.function?.arguments) }));
        }
        if (msgShape?.function_call) {
          return [{ name: msgShape.function_call.name, arguments: safeJson(msgShape.function_call.arguments) }];
        }
        return undefined;
      })();
      type MessageWithToolCalls = Message & { tool_calls?: Array<{ id?: string; name?: string; arguments?: unknown }> };
      const msgBase = { role: (choice?.message?.role ?? 'assistant') as Message['role'], content: choice?.message?.content ?? '' };
      const msg = msgBase as MessageWithToolCalls;
      if (toolCalls) msg.tool_calls = toolCalls;
      const usage = mapUsage(data?.usage);
      return { message: msg, ...(usage ? { usage } : {}) };
    }
  };
}

function toOpenAiTool(tool: Tool) {
  return {
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: toJsonSchema(tool.schema),
    }
  } as OpenAITool;
}

function toJsonSchema(schema: unknown): Record<string, unknown> {
  // Minimal zod-ish to JSON Schema converter for common primitives
  if (!schema || typeof schema !== 'object') return { type: 'object' };
  const def = (schema as ZodLike)._def as Record<string, unknown> | undefined;
  const t = def?.typeName as string | undefined;
  if (t === 'ZodString') return { type: 'string' };
  if (t === 'ZodNumber') return { type: 'number' };
  if (t === 'ZodBoolean') return { type: 'boolean' };
  if (t === 'ZodArray') return { type: 'array', items: toJsonSchema(def?.type) };
  if (t === 'ZodOptional') return toJsonSchema(def?.innerType);
  if (t === 'ZodObject') {
    const shape = typeof def?.shape === 'function' ? (def!.shape as (() => Record<string, unknown>))() : def?.shape as Record<string, unknown> | undefined;
    const props: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, val] of Object.entries(shape ?? {})) {
      props[key] = toJsonSchema(val);
      const innerTypeName = ((val as ZodLike)?._def?.typeName) as string | undefined;
      if (innerTypeName !== 'ZodOptional' && innerTypeName !== 'ZodDefault') required.push(key);
    }
    return { type: 'object', properties: props, ...(required.length ? { required } : {}), additionalProperties: false };
  }
  // Fallback
  return { type: 'object' };
}

function safeJson(s: unknown): unknown {
  if (typeof s !== 'string') return s;
  try { return JSON.parse(s); } catch (e) { void e; return s; }
}
function normalizeToolChoice(choice: GenerateOptions['toolChoice']) {
  if (!choice) return undefined;
  if (choice === 'auto' || choice === 'none') return choice;
  // assume specific function name
  return { type: 'function', function: { name: choice } } as const;
}

function toOpenAiMessage(m: Message): OpenAIChatMessage {
  const base: OpenAIChatMessage = { role: m.role as OpenAIChatMessage['role'] };

  // Tool responses must be simple strings for OpenAI
  if (m.role === 'tool') {
    const anyM = m as Message & { tool_call_id?: string; name?: string; content?: unknown };
    return {
      ...base,
      content: String(anyM.content ?? ''),
      ...(anyM.tool_call_id ? { tool_call_id: anyM.tool_call_id } : {}),
      ...(anyM.name && !anyM.tool_call_id ? { name: anyM.name } : {}),
    };
  }

  const anyM = m as Message & { tool_calls?: Array<{ id?: string; name?: string; arguments?: unknown }>; contentParts?: unknown; images?: unknown; image_urls?: unknown; image_url?: unknown; image?: unknown };
  const toolCalls = Array.isArray(anyM.tool_calls)
    ? anyM.tool_calls.map((tc) => ({ id: tc.id, type: 'function' as const, function: { name: tc.name ?? '', arguments: JSON.stringify(tc.arguments ?? {}) } }))
    : undefined;

  // Build content parts if images or structured parts are present
  const parts = buildContentParts(anyM);

  // Prefer null content if only tool_calls are present and no content parts
  if (m.role === 'assistant') {
    return {
      ...base,
      content: (toolCalls && (!hasTextOrImages(parts) && (m.content === undefined || m.content === ''))) ? null : (parts ?? m.content ?? ''),
      ...(toolCalls ? { tool_calls: toolCalls } : {}),
    };
  }

  return {
    ...base,
    content: parts ?? (m.content ?? ''),
    ...(m.name ? { name: m.name } : {}),
  };
}

function hasTextOrImages(parts?: OpenAIContentPart[] | string | null): boolean {
  if (!parts) return false;
  if (typeof parts === 'string') return parts.length > 0;
  return Array.isArray(parts) && parts.length > 0;
}

// Accepts multiple ways to specify rich content:
// - content: string (plain text)
// - content: OpenAIContentPart[] (already structured)
// - contentParts: Array<string | {type:'text'|'image_url'|'image', text?: string, image_url?: string|{url:string}, url?: string}>
// - images: string[] (urls or data:image/*)
// - image_url / image: string (single image)
function buildContentParts(m: unknown): OpenAIContentPart[] | undefined {
  if (!m || typeof m !== 'object') return undefined;
  const obj = m as Record<string, unknown>;
  // If content is already an array of parts, normalize and return
  if (Array.isArray(obj.content)) return normalizePartsArray(obj.content);
  if (Array.isArray(obj.contentParts)) return normalizePartsArray(obj.contentParts);
  const images: string[] = [];
  if (Array.isArray(obj.images)) images.push(...(obj.images as string[]));
  if (Array.isArray(obj.image_urls)) images.push(...(obj.image_urls as string[]));
  if (typeof obj.image_url === 'string') images.push(obj.image_url);
  if (typeof obj.image === 'string') images.push(obj.image);
  const hasImages = images.length > 0;
  const hasText = typeof obj.content === 'string' && obj.content.length > 0;
  if (!hasImages) return undefined;
  const parts: OpenAIContentPart[] = [];
  if (hasText) parts.push({ type: 'text', text: String(obj.content) });
  for (const url of images) parts.push({ type: 'image_url', image_url: toImageUrl(url) });
  return parts;
}

function toImageUrl(url: string): { url: string } | string {
  // OpenAI allows either a string or an object {url}
  // Keep data: URLs as-is; wrap regular strings in { url }
  if (typeof url !== 'string') return { url: String(url) };
  // We can pass string directly per API spec
  return url;
}

function normalizePartsArray(parts: Array<unknown>): OpenAIContentPart[] {
  const out: OpenAIContentPart[] = [];
  for (const p of parts) {
    if (typeof p === 'string') {
      out.push({ type: 'text', text: p });
      continue;
    }
    if (!p || typeof p !== 'object') continue;
    const obj = p as Record<string, unknown>;
    const t = obj.type as string | undefined;
    if (t === 'text' && typeof obj.text === 'string') {
      out.push({ type: 'text', text: obj.text });
      continue;
    }
    if (t === 'image_url') {
      const iu = obj.image_url;
      if (typeof iu === 'string') {
        out.push({ type: 'image_url', image_url: iu });
      } else if (iu && typeof iu === 'object' && typeof (iu as Record<string, unknown>).url === 'string') {
        out.push({ type: 'image_url', image_url: { url: (iu as Record<string, unknown>).url as string } });
      }
      continue;
    }
    // Common alias: { type: 'image', url: '...' }
    if (t === 'image' && typeof obj.url === 'string') {
      out.push({ type: 'image_url', image_url: obj.url });
      continue;
    }
    // Common alias: { image_url: '...' } or { image: '...' }
    if (typeof obj.image_url === 'string') {
      out.push({ type: 'image_url', image_url: obj.image_url });
      continue;
    }
    if (typeof obj.image === 'string') {
      out.push({ type: 'image_url', image_url: obj.image });
      continue;
    }
  }
  return out;
}

function summarize(v: unknown, max = 300): unknown {
  if (typeof v !== 'string') return v;
  return v.length > max ? v.slice(0, max) + '…' : v;
}

function mapUsage(u: unknown) {
  if (!u || typeof u !== 'object') return undefined;
  const obj = u as Record<string, unknown>;
  const prompt = obj.prompt_tokens ?? obj.input_tokens;
  const completion = obj.completion_tokens ?? obj.output_tokens;
  const total = obj.total_tokens ?? (Number(prompt ?? 0) + Number(completion ?? 0));
  return {
    promptTokens: typeof prompt === 'number' ? prompt : undefined,
    completionTokens: typeof completion === 'number' ? completion : undefined,
    totalTokens: typeof total === 'number' ? total : undefined,
  } as ModelResponse['usage'];
}
