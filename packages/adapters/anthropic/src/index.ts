import type { LLM, Message, ModelResponse, GenerateOptions, Tool } from '@sisu-ai/core';
import { firstConfigValue } from '@sisu-ai/core';

export interface AnthropicAdapterOptions {
  model: string;
  apiKey?: string;
  baseUrl?: string;
  // future: anthropicVersion?: string;
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: any[]; // anthropic content blocks
}

export function anthropicAdapter(opts: AnthropicAdapterOptions): LLM {
  const apiKey = opts.apiKey ?? firstConfigValue(['ANTHROPIC_API_KEY', 'API_KEY']) ?? '';
  const envBase = firstConfigValue(['ANTHROPIC_BASE_URL', 'BASE_URL']);
  const baseUrl = (opts.baseUrl ?? envBase ?? 'https://api.anthropic.com').replace(/\/$/, '');
  if (!apiKey) {
    throw new Error('[anthropicAdapter] Missing ANTHROPIC_API_KEY or API_KEY — set it in your environment or pass { apiKey }');
  }
  const modelName = `anthropic:${opts.model}`;
  return {
    name: modelName,
    capabilities: { functionCall: true, streaming: false },
    async generate(messages: Message[], genOpts?: GenerateOptions): Promise<ModelResponse> {
      const systemMsgs = messages.filter(m => m.role === 'system').map(m => String(m.content ?? ''));
      const mapped: AnthropicMessage[] = messages
        .filter(m => m.role !== 'system')
        .map(m => toAnthropicMessage(m));
      const toolsParam = (genOpts?.tools ?? []).map(toAnthropicTool);
      const tool_choice = normalizeToolChoice(genOpts?.toolChoice);
      const body: any = {
        model: opts.model,
        max_tokens: genOpts?.maxTokens ?? 1024,
        messages: mapped,
        temperature: genOpts?.temperature ?? 0.2,
        ...(systemMsgs.length ? { system: systemMsgs.join('\n') } : {}),
        ...(toolsParam.length ? { tools: toolsParam } : {}),
        // Anthropic rejects tool_choice when tools are not provided
        ...((toolsParam.length && tool_choice !== undefined) ? { tool_choice } : {}),
      };
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });
      const raw = await res.text();
      if (!res.ok) {
        let details = raw;
        try { const j = JSON.parse(raw); details = j.error?.message ?? j.error ?? raw; } catch {}
        throw new Error(`Anthropic API error: ${res.status} ${res.statusText} — ${String(details).slice(0, 500)}`);
      }
      const data: any = raw ? JSON.parse(raw) : {};
      const { text, tool_calls } = fromAnthropicContent(data.content);
      const msg: any = { role: 'assistant', content: text };
      if (tool_calls) msg.tool_calls = tool_calls;
      const usage = mapUsage(data.usage);
      return { message: msg, ...(usage ? { usage } : {}) };
    },
  };
}

function toAnthropicTool(tool: Tool) {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: toJsonSchema((tool as any).schema),
  };
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

function normalizeToolChoice(choice: GenerateOptions['toolChoice']) {
  if (!choice) return undefined;
  if (choice === 'auto' || choice === 'none') return { type: choice } as const;
  return { type: 'tool', name: choice } as const;
}

function toAnthropicMessage(m: Message): AnthropicMessage {
  const anyM: any = m as any;
  if (m.role === 'assistant') {
    const content: any[] = [];
    if (anyM.content) content.push({ type: 'text', text: String(anyM.content) });
    if (Array.isArray(anyM.tool_calls)) {
      for (const tc of anyM.tool_calls) {
        content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments ?? {} });
      }
    }
    return { role: 'assistant', content };
  }
  if (m.role === 'tool') {
    return {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: anyM.tool_call_id ?? anyM.name, content: String(anyM.content ?? '') }],
    };
  }
  // user or others
  return { role: 'user', content: [{ type: 'text', text: String(anyM.content ?? '') }] };
}

function fromAnthropicContent(blocks: any[] | undefined): { text: string; tool_calls?: any[] } {
  const texts: string[] = [];
  const tool_calls: any[] = [];
  for (const b of blocks ?? []) {
    if (!b) continue;
    if (b.type === 'text' && typeof b.text === 'string') {
      texts.push(b.text);
    } else if (b.type === 'tool_use') {
      tool_calls.push({ id: b.id, name: b.name, arguments: b.input });
    }
  }
  return { text: texts.join(''), ...(tool_calls.length ? { tool_calls } : {}) };
}

function mapUsage(u: any) {
  if (!u) return undefined;
  const prompt = u.input_tokens;
  const completion = u.output_tokens;
  const total = typeof prompt === 'number' && typeof completion === 'number' ? prompt + completion : undefined;
  return {
    promptTokens: typeof prompt === 'number' ? prompt : undefined,
    completionTokens: typeof completion === 'number' ? completion : undefined,
    totalTokens: typeof total === 'number' ? total : undefined,
  } as ModelResponse['usage'];
}

