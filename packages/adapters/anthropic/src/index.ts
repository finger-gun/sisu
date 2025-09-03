import type { LLM, Message, ModelResponse, GenerateOptions, Tool, ModelEvent } from '@sisu-ai/core';
import { firstConfigValue } from '@sisu-ai/core';

export interface AnthropicAdapterOptions {
  model: string;
  apiKey?: string;
  baseUrl?: string;
  anthropicVersion?: string;
  timeout?: number;
  maxRetries?: number;
}

interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: any;
  tool_use_id?: string;
  content?: string;
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: AnthropicContentBlock[];
}

interface AnthropicToolChoice {
  type: 'auto' | 'none' | 'tool';
  name?: string;
}

const DEFAULT_TIMEOUT = 60000; // 60 seconds
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_ANTHROPIC_VERSION = '2023-06-01';

export function anthropicAdapter(opts: AnthropicAdapterOptions): LLM {
  // Validate required options
  if (!opts.model) {
    throw new Error('[anthropicAdapter] model is required');
  }

  const apiKey = opts.apiKey ?? firstConfigValue(['ANTHROPIC_API_KEY', 'API_KEY']) ?? '';
  const envBase = firstConfigValue(['ANTHROPIC_BASE_URL', 'BASE_URL']);
  const baseUrl = (opts.baseUrl ?? envBase ?? 'https://api.anthropic.com').replace(/\/$/, '');
  const timeout = opts.timeout ?? DEFAULT_TIMEOUT;
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const anthropicVersion = opts.anthropicVersion ?? DEFAULT_ANTHROPIC_VERSION;

  if (!apiKey) {
    throw new Error('[anthropicAdapter] Missing ANTHROPIC_API_KEY or API_KEY — set it in your environment or pass { apiKey }');
  }

  const modelName = `anthropic:${opts.model}`;

  return {
    name: modelName,
    capabilities: { functionCall: true, streaming: true },
  async generate(messages: Message[], genOpts?: GenerateOptions): Promise<ModelResponse | AsyncIterable<ModelEvent>> {
      const systemMsgs = messages.filter(m => m.role === 'system').map(m => String(m.content ?? ''));
      const mapped: AnthropicMessage[] = messages
        .filter(m => m.role !== 'system')
        .map(m => toAnthropicMessage(m));

      // Some tests or streaming scenarios may call generate with an empty messages array.
      // Only treat empty mapped messages as an error for non-streaming requests.
      if (mapped.length === 0 && !genOpts?.stream) {
        throw new Error('[anthropicAdapter] No valid user/assistant messages found');
      }

      const toolsParam = (genOpts?.tools ?? []).map(toAnthropicTool);
      const tool_choice = normalizeToolChoice(genOpts?.toolChoice, toolsParam.length > 0);

      const body: any = {
        model: opts.model,
        max_tokens: Math.min(genOpts?.maxTokens ?? 4096, 8192), // Ensure reasonable limits
        messages: mapped,
        temperature: Math.max(0, Math.min(1, genOpts?.temperature ?? 0.7)), // Clamp to valid range
        ...(systemMsgs.length ? { system: systemMsgs.join('\n') } : {}),
        ...(toolsParam.length ? { tools: toolsParam } : {}),
        // Anthropic rejects tool_choice when tools are not provided
        ...((toolsParam.length && tool_choice !== undefined) ? { tool_choice } : {}),
        ...(genOpts?.stream ? { stream: true } : {}),
      };

      return await makeRequestWithRetry(baseUrl, apiKey, anthropicVersion, body, timeout, maxRetries, Boolean(genOpts?.stream));
    },
  };
}

async function makeRequestWithRetry(
  baseUrl: string,
  apiKey: string,
  anthropicVersion: string,
  body: any,
  timeout: number,
  maxRetries: number
  , stream: boolean
): Promise<ModelResponse | AsyncIterable<ModelEvent>> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

  const res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': anthropicVersion,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
  if (stream) {
        if (!res.ok || !res.body) {
          const err = await res.text();
          throw new Error(`Anthropic API error: ${res.status} ${res.statusText} — ${String(err).slice(0,500)}`);
        }
        const iter = async function*() {
          const decoder = new TextDecoder();
          let buf = '';
          let full = '';
          for await (const chunk of res.body as any) {
            const piece = typeof chunk === 'string' ? chunk : decoder.decode(chunk);
            buf += piece;
            const lines = buf.split('\n');
            buf = lines.pop() ?? '';
            for (const line of lines) {
              const m = line.match(/^data:\s*(.*)/);
              if (!m) continue;
              const data = m[1].trim();
              if (!data) continue;
              try {
                const j = JSON.parse(data);
                if (j.type === 'content_block_delta') {
                  const t = j.delta?.text;
                  if (typeof t === 'string') {
                    full += t;
                    yield { type: 'token', token: t } as ModelEvent;
                  }
                } else if (j.type === 'message_stop') {
                  yield { type: 'assistant_message', message: { role: 'assistant', content: full } } as ModelEvent;
                  return;
                }
              } catch {}
            }
          }
        };
  return iter();
      }
      const raw = await res.text();
      
      if (!res.ok) {
        let details = raw;
        try { 
          const j = JSON.parse(raw); 
          details = j.error?.message ?? j.error ?? raw; 
        } catch {}
        
        const error = new Error(`Anthropic API error: ${res.status} ${res.statusText} — ${String(details).slice(0, 500)}`);
        
        // Don't retry on client errors (4xx) except rate limits
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          throw error;
        }
        
        lastError = error;
        if (attempt < maxRetries) {
          await sleep(Math.pow(2, attempt) * 1000); // Exponential backoff
          continue;
        }
        throw error;
      }

      let data: any;
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch (parseError) {
        throw new Error(`Failed to parse Anthropic API response: ${parseError}`);
      }

      // Validate response structure
      if (!data.content || !Array.isArray(data.content)) {
        throw new Error('Invalid Anthropic API response: missing or invalid content array');
      }

      const { text, tool_calls } = fromAnthropicContent(data.content);
      const msg: any = { role: 'assistant', content: text };
      if (tool_calls && tool_calls.length > 0) msg.tool_calls = tool_calls;
      
      const usage = mapUsage(data.usage);
      return { message: msg, ...(usage ? { usage } : {}) };

    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on non-retryable errors
      if (error instanceof Error && (
        error.name === 'AbortError' || 
        error.message.includes('Failed to parse') ||
        error.message.includes('Invalid Anthropic API response')
      )) {
        throw error;
      }
      
      if (attempt < maxRetries) {
        await sleep(Math.pow(2, attempt) * 1000); // Exponential backoff
        continue;
      }
      throw error;
    }
  }

  throw lastError!;
}

function toAnthropicTool(tool: Tool) {
  if (!tool.name) {
    throw new Error('[anthropicAdapter] Tool must have a name');
  }
  
  return {
    name: tool.name,
    description: tool.description || '',
    input_schema: toJsonSchema((tool as any).schema),
  };
}

function toJsonSchema(schema: any): any {
  if (!schema) return { type: 'object' };
  
  const t = schema?._def?.typeName;
  
  switch (t) {
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodArray':
      return { type: 'array', items: toJsonSchema(schema._def?.type) };
    case 'ZodOptional':
    case 'ZodDefault':
      return toJsonSchema(schema._def?.innerType);
    case 'ZodObject': {
      const shape = typeof schema._def?.shape === 'function' ? schema._def.shape() : schema._def?.shape;
      const props: Record<string, any> = {};
      const required: string[] = [];
      
      for (const [key, val] of Object.entries(shape ?? {})) {
        props[key] = toJsonSchema(val as any);
        const innerTypeName = (val as any)?._def?.typeName;
        if (innerTypeName !== 'ZodOptional' && innerTypeName !== 'ZodDefault') {
          required.push(key);
        }
      }
      
      return { 
        type: 'object', 
        properties: props, 
        ...(required.length ? { required } : {}) 
      };
    }
    case 'ZodEnum':
      return { 
        type: 'string', 
        enum: schema._def?.values || [] 
      };
    case 'ZodLiteral':
      return { 
        type: typeof schema._def?.value === 'string' ? 'string' : 'number',
        enum: [schema._def?.value]
      };
    default:
      return { type: 'object' };
  }
}

function normalizeToolChoice(choice: GenerateOptions['toolChoice'], hasTools: boolean): AnthropicToolChoice | undefined {
  if (!choice || !hasTools) return undefined;
  
  if (choice === 'auto') return { type: 'auto' };
  if (choice === 'none') return { type: 'none' };
  
  // Specific tool choice
  return { type: 'tool', name: choice };
}

function toAnthropicMessage(m: Message): AnthropicMessage {
  const anyM: any = m as any;
  
  if (m.role === 'assistant') {
    const content: AnthropicContentBlock[] = [];
    
    if (anyM.content) {
      content.push({ type: 'text', text: String(anyM.content) });
    }
    
    if (Array.isArray(anyM.tool_calls)) {
      for (const tc of anyM.tool_calls) {
        if (!tc.id || !tc.name) {
          console.warn('[anthropicAdapter] Tool call missing required id or name');
          continue;
        }
        content.push({ 
          type: 'tool_use', 
          id: tc.id, 
          name: tc.name, 
          input: tc.arguments ?? {} 
        });
      }
    }
    
    return { role: 'assistant', content };
  }
  
  if (m.role === 'tool') {
    const toolCallId = anyM.tool_call_id ?? anyM.name;
    if (!toolCallId) {
      throw new Error('[anthropicAdapter] Tool message must have tool_call_id or name');
    }
    
    return {
      role: 'user',
      content: [{ 
        type: 'tool_result', 
        tool_use_id: toolCallId, 
        content: String(anyM.content ?? '') 
      }],
    };
  }
  
  // user or others
  return { 
    role: 'user', 
    content: [{ type: 'text', text: String(anyM.content ?? '') }] 
  };
}

function fromAnthropicContent(blocks: any[]): { text: string; tool_calls?: any[] } {
  if (!Array.isArray(blocks)) {
    throw new Error('[anthropicAdapter] Expected content to be an array');
  }

  const texts: string[] = [];
  const tool_calls: any[] = [];
  
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    
    if (b.type === 'text' && typeof b.text === 'string') {
      texts.push(b.text);
    } else if (b.type === 'tool_use') {
      if (!b.id || !b.name) {
        console.warn('[anthropicAdapter] Tool use block missing required id or name');
        continue;
      }
      tool_calls.push({ 
        id: b.id, 
        name: b.name, 
        arguments: b.input ?? {} 
      });
    }
  }
  
  return { 
    text: texts.join(''), 
    ...(tool_calls.length ? { tool_calls } : {}) 
  };
}

function mapUsage(u: any): ModelResponse['usage'] | undefined {
  if (!u || typeof u !== 'object') return undefined;
  
  const prompt = u.input_tokens;
  const completion = u.output_tokens;
  const total = typeof prompt === 'number' && typeof completion === 'number' ? prompt + completion : undefined;
  
  return {
    promptTokens: typeof prompt === 'number' ? prompt : undefined,
    completionTokens: typeof completion === 'number' ? completion : undefined,
    totalTokens: typeof total === 'number' ? total : undefined,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}