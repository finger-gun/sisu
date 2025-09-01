import type { LLM, Message, ModelResponse, GenerateOptions, Tool } from '@sisu-ai/core';
import { firstConfigValue } from '@sisu-ai/core';
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
export interface OpenAIAdapterOptions { model: string; apiKey?: string; baseUrl?: string; responseModel?: string; }
export function openAIAdapter(opts: OpenAIAdapterOptions): LLM {
  const apiKey = opts.apiKey ?? firstConfigValue(['OPENAI_API_KEY','API_KEY']) ?? '';
  const envBase = firstConfigValue(['OPENAI_BASE_URL','BASE_URL']);
  const baseUrl = (opts.baseUrl ?? envBase ?? 'https://api.openai.com').replace(/\/$/, '');
  if (!apiKey) throw new Error('[openAIAdapter] Missing OPENAI_API_KEY or API_KEY — set it in your environment or pass { apiKey }');
  const DEBUG = String(process.env.DEBUG_LLM || '').toLowerCase() === 'true' || process.env.DEBUG_LLM === '1';
  return {
    name: 'openai:' + opts.model,
    capabilities: { functionCall: true, streaming: false },
    // Non-standard metadata for tools that may target other OpenAI surfaces (e.g., Responses API)
    ...(opts.responseModel ? { meta: { responseModel: opts.responseModel } } : {}),
    async generate(messages: Message[], genOpts?: GenerateOptions): Promise<ModelResponse> {
      const toolsParam = (genOpts?.tools ?? []).map(t => toOpenAiTool(t));
      const tool_choice = normalizeToolChoice(genOpts?.toolChoice);
      const body: any = {
        model: opts.model,
        messages: messages.map(m => toOpenAiMessage(m)),
        temperature: genOpts?.temperature ?? 0.2,
        ...(toolsParam.length ? { tools: toolsParam } : {}),
        // Some providers reject tool_choice when tools are not present; include only when tools exist
        ...((toolsParam.length && tool_choice !== undefined) ? { tool_choice } : {}),
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
            content: Array.isArray(m.content)
              ? `[${m.content.length} parts]`
              : (typeof m.content === 'string' ? summarize(m.content) : m.content === null ? null : typeof m.content),
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

  // Tool responses must be simple strings for OpenAI
  if (m.role === 'tool') {
    const anyM = m as any;
    return {
      ...base,
      content: String(anyM.content ?? ''),
      ...(anyM.tool_call_id ? { tool_call_id: anyM.tool_call_id } : {}),
      ...(anyM.name && !anyM.tool_call_id ? { name: anyM.name } : {}),
    };
  }

  const anyM: any = m as any;
  const toolCalls = Array.isArray(anyM.tool_calls)
    ? anyM.tool_calls.map((tc: any) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.arguments ?? {}) } }))
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
function buildContentParts(m: any): OpenAIContentPart[] | undefined {
  // If content is already an array of parts, normalize and return
  if (Array.isArray(m.content)) {
    return normalizePartsArray(m.content);
  }

  // If a dedicated contentParts field exists, use it
  if (Array.isArray(m.contentParts)) {
    return normalizePartsArray(m.contentParts);
  }

  // Collect images from common shapes
  const images: string[] = [];
  if (Array.isArray(m.images)) images.push(...m.images);
  if (Array.isArray(m.image_urls)) images.push(...m.image_urls);
  if (typeof m.image_url === 'string') images.push(m.image_url);
  if (typeof m.image === 'string') images.push(m.image);

  const hasImages = images.length > 0;
  const hasText = typeof m.content === 'string' && m.content.length > 0;
  if (!hasImages) return undefined; // fall back to plain string handling

  const parts: OpenAIContentPart[] = [];
  if (hasText) parts.push({ type: 'text', text: String(m.content) });
  for (const url of images) {
    parts.push({ type: 'image_url', image_url: toImageUrl(url) });
  }
  return parts;
}

function toImageUrl(url: string): { url: string } | string {
  // OpenAI allows either a string or an object {url}
  // Keep data: URLs as-is; wrap regular strings in { url }
  if (typeof url !== 'string') return url as any;
  // We can pass string directly per API spec
  return url;
}

function normalizePartsArray(parts: any[]): OpenAIContentPart[] {
  const out: OpenAIContentPart[] = [];
  for (const p of parts) {
    if (typeof p === 'string') {
      out.push({ type: 'text', text: p });
      continue;
    }
    if (!p || typeof p !== 'object') continue;
    const t = (p as any).type;
    if (t === 'text' && typeof p.text === 'string') {
      out.push({ type: 'text', text: p.text });
      continue;
    }
    if (t === 'image_url') {
      const iu = (p as any).image_url;
      if (typeof iu === 'string' || (iu && typeof iu === 'object' && typeof iu.url === 'string')) {
        out.push({ type: 'image_url', image_url: iu });
      }
      continue;
    }
    // Common alias: { type: 'image', url: '...' }
    if (t === 'image' && typeof (p as any).url === 'string') {
      out.push({ type: 'image_url', image_url: (p as any).url });
      continue;
    }
    // Common alias: { image_url: '...' } or { image: '...' }
    if (typeof (p as any).image_url === 'string') {
      out.push({ type: 'image_url', image_url: (p as any).image_url });
      continue;
    }
    if (typeof (p as any).image === 'string') {
      out.push({ type: 'image_url', image_url: (p as any).image });
      continue;
    }
  }
  return out;
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
