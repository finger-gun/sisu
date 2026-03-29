import type {
  LLM,
  Message,
  ModelResponse,
  GenerateOptions,
  Tool,
  ModelEvent,
  ToolCall,
  EmbeddingsProvider,
} from "@sisu-ai/core";
import { createEmbeddingsClient, firstConfigValue } from "@sisu-ai/core";

export interface AnthropicEmbeddingsOptions {
  baseUrl: string;
  model: string;
  apiKey?: string;
  headers?: Record<string, string>;
}

function resolveBaseUrl(
  explicitBaseUrl: string | undefined,
  envBaseUrl: string | undefined,
  fallback: string,
): string {
  const candidate = explicitBaseUrl || envBaseUrl;
  return (candidate && candidate !== "/" ? candidate : fallback).replace(
    /\/$/,
    "",
  );
}

export function anthropicEmbeddings(
  opts: AnthropicEmbeddingsOptions,
): EmbeddingsProvider {
  if (!opts.baseUrl) {
    throw new Error(
      "[anthropicEmbeddings] baseUrl is required because Anthropic does not provide a native embeddings API",
    );
  }
  if (!opts.model) {
    throw new Error("[anthropicEmbeddings] model is required");
  }

  return createEmbeddingsClient({
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
    headers: opts.headers,
    model: opts.model,
    clientName: "anthropicEmbeddings",
  });
}

type FetchResponse = Awaited<ReturnType<typeof fetch>>;
type ToolCallLike = { id?: string; name?: string; arguments?: unknown };
type ZodSchemaLike = {
  _def?: {
    typeName?: string;
    type?: unknown;
    innerType?: unknown;
    shape?: unknown;
    values?: unknown;
    value?: unknown;
  };
};

type AnthropicImageSource = {
  type: "base64";
  media_type: string;
  data: string;
};

type AnthropicInputContentPart =
  | { type: "text"; text: string }
  | { type: "image"; source: AnthropicImageSource };

export interface AnthropicAdapterOptions {
  model: string;
  apiKey?: string;
  baseUrl?: string;
  anthropicVersion?: string;
  timeout?: number;
  maxRetries?: number;
}

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: AnthropicImageSource }
  | { type: "tool_use"; id: string; name: string; input?: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

interface AnthropicMessage {
  role: "user" | "assistant";
  content: AnthropicContentBlock[];
}

interface AnthropicToolChoice {
  type: "auto" | "none" | "tool";
  name?: string;
}

const DEFAULT_TIMEOUT = 60000; // 60 seconds
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";

export function anthropicAdapter(opts: AnthropicAdapterOptions): LLM {
  // Validate required options
  if (!opts.model) {
    throw new Error("[anthropicAdapter] model is required");
  }

  const apiKey =
    opts.apiKey ?? firstConfigValue(["API_KEY", "ANTHROPIC_API_KEY"]) ?? "";
  const envBase = firstConfigValue(["BASE_URL", "ANTHROPIC_BASE_URL"]);
  const baseUrl = resolveBaseUrl(
    opts.baseUrl,
    envBase,
    "https://api.anthropic.com",
  );
  const timeout = opts.timeout ?? DEFAULT_TIMEOUT;
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const anthropicVersion = opts.anthropicVersion ?? DEFAULT_ANTHROPIC_VERSION;

  if (!apiKey) {
    throw new Error(
      "[anthropicAdapter] Missing API_KEY or ANTHROPIC_API_KEY — set it in your environment or pass { apiKey }",
    );
  }

  const modelName = `anthropic:${opts.model}`;

  const generate = ((
    messages: Message[],
    genOpts?: GenerateOptions,
  ): Promise<ModelResponse> | AsyncIterable<ModelEvent> => {
    const systemMsgs = messages
      .filter((m) => m.role === "system")
      .map((m) => String(m.content ?? ""));
    if (genOpts?.stream === true) {
      return (async function* () {
        const mapped = await Promise.all(
          messages
            .filter((m) => m.role !== "system")
            .map((m) => toAnthropicMessageAsync(m, genOpts?.signal)),
        );
        const toolsParam = (genOpts?.tools ?? []).map(toAnthropicTool);
        const tool_choice = normalizeToolChoice(
          genOpts?.toolChoice,
          toolsParam.length > 0,
        );

        const body: Record<string, unknown> = {
          model: opts.model,
          max_tokens: Math.min(genOpts?.maxTokens ?? 4096, 8192),
          messages: mapped,
          temperature: Math.max(0, Math.min(1, genOpts?.temperature ?? 0.7)),
          ...(systemMsgs.length ? { system: systemMsgs.join("\n") } : {}),
          ...(toolsParam.length ? { tools: toolsParam } : {}),
          ...(toolsParam.length && tool_choice !== undefined
            ? { tool_choice }
            : {}),
          stream: true,
        };

        const iter = makeRequestWithRetry(
          baseUrl,
          apiKey,
          anthropicVersion,
          body,
          timeout,
          maxRetries,
          true,
          genOpts?.signal,
        ) as AsyncIterable<ModelEvent>;
        for await (const ev of iter) {
          yield ev;
        }
      })();
    }

    return (async () => {
      const mapped = await Promise.all(
        messages
          .filter((m) => m.role !== "system")
          .map((m) => toAnthropicMessageAsync(m, genOpts?.signal)),
      );

      if (mapped.length === 0) {
        throw new Error("[anthropicAdapter] No valid user/assistant messages found");
      }

      const toolsParam = (genOpts?.tools ?? []).map(toAnthropicTool);
      const tool_choice = normalizeToolChoice(
        genOpts?.toolChoice,
        toolsParam.length > 0,
      );

      const body: Record<string, unknown> = {
        model: opts.model,
        max_tokens: Math.min(genOpts?.maxTokens ?? 4096, 8192),
        messages: mapped,
        temperature: Math.max(0, Math.min(1, genOpts?.temperature ?? 0.7)),
        ...(systemMsgs.length ? { system: systemMsgs.join("\n") } : {}),
        ...(toolsParam.length ? { tools: toolsParam } : {}),
        ...(toolsParam.length && tool_choice !== undefined
          ? { tool_choice }
          : {}),
      };

      return makeRequestWithRetry(
        baseUrl,
        apiKey,
        anthropicVersion,
        body,
        timeout,
        maxRetries,
        false,
        genOpts?.signal,
      ) as Promise<ModelResponse>;
    })();
  }) as LLM["generate"];

  return {
    name: modelName,
    capabilities: { functionCall: true, streaming: true },
    generate,
  };
}

function makeRequestWithRetry(
  baseUrl: string,
  apiKey: string,
  anthropicVersion: string,
  body: Record<string, unknown>,
  timeout: number,
  maxRetries: number,
  stream: boolean,
  signal?: AbortSignal,
): Promise<ModelResponse> | AsyncIterable<ModelEvent> {
  let lastError: Error;
  const parseResetHeader = (value: string): number | undefined => {
    const t = Date.parse(value);
    if (!Number.isNaN(t)) return Math.max(0, t - Date.now());
    const n = Number(value);
    if (!Number.isNaN(n)) {
      if (n > 1e12) return Math.max(0, n - Date.now());
      return Math.max(0, n * 1000);
    }
    return undefined;
  };

  const getRetryDelayMs = (res: FetchResponse | undefined, attempt: number) => {
    if (res) {
      const retryAfter = res.headers.get("retry-after");
      if (retryAfter) {
        const d = parseResetHeader(retryAfter);
        if (d !== undefined) return d;
      }

      const resets = [
        res.headers.get("anthropic-ratelimit-requests-reset"),
        res.headers.get("anthropic-ratelimit-tokens-reset"),
        res.headers.get("anthropic-ratelimit-input-tokens-reset"),
        res.headers.get("anthropic-ratelimit-output-tokens-reset"),
        res.headers.get("anthropic-priority-input-tokens-reset"),
        res.headers.get("anthropic-priority-output-tokens-reset"),
      ]
        .filter((v): v is string => Boolean(v))
        .map((v) => parseResetHeader(v))
        .filter((v): v is number => typeof v === "number");

      if (resets.length > 0) {
        return Math.max(...resets);
      }
    }

    return Math.pow(2, attempt) * 1000;
  };
  if (stream) {
    const iter = async function* () {
      let lastRes: FetchResponse | undefined;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);
          const cleanupAbort = bindAbortSignal(signal, controller);
          try {
            const res = await fetch(`${baseUrl}/v1/messages`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": anthropicVersion,
              },
              body: JSON.stringify(body),
              signal: controller.signal,
            });
            lastRes = res;
            if (!res.ok || !res.body) {
              const err = await res.text();
              const error = new Error(
                `Anthropic API error: ${res.status} ${res.statusText} — ${String(err).slice(0, 500)}`,
              );
              if (res.status >= 400 && res.status < 500 && res.status !== 429)
                throw error;
              lastError = error;
              if (attempt < maxRetries) {
                await sleep(getRetryDelayMs(res, attempt));
                continue;
              }
              throw error;
            }

            const decoder = new TextDecoder();
            let buf = "";
            let full = "";
            for await (const chunk of res.body as unknown as AsyncIterable<
              Uint8Array | string
            >) {
              const piece =
                typeof chunk === "string" ? chunk : decoder.decode(chunk);
              buf += piece;
              const lines = buf.split("\n");
              buf = lines.pop() ?? "";
              for (const line of lines) {
                const m = line.match(/^data:\s*(.*)/);
                if (!m) continue;
                const data = m[1].trim();
                if (!data) continue;
                try {
                  const j = JSON.parse(data);
                  if (j.type === "content_block_delta") {
                    const t = j.delta?.text;
                    if (typeof t === "string") {
                      full += t;
                      yield { type: "token", token: t } as ModelEvent;
                    }
                  } else if (j.type === "message_stop") {
                    yield {
                      type: "assistant_message",
                      message: { role: "assistant", content: full },
                    } as ModelEvent;
                    return;
                  }
                } catch (e: unknown) {
                  console.error("[DEBUG_LLM] stream_parse_error", { error: e });
                }
              }
            }
            return;
          } finally {
            // ensure timeout is cleared when request completes/aborts
            clearTimeout(timeoutId);
            cleanupAbort();
          }
        } catch (error) {
          lastError = error as Error;
          if (error instanceof Error && error.name === "AbortError") {
            throw error;
          }
          if (attempt < maxRetries) {
            await sleep(getRetryDelayMs(lastRes, attempt));
            continue;
          }
          throw error;
        }
      }
      throw lastError!;
    };
    return iter();
  }

  // Non-streaming branch returns a Promise
  return (async () => {
    let lastRes: FetchResponse | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        const cleanupAbort = bindAbortSignal(signal, controller);
        try {
          const res = await fetch(`${baseUrl}/v1/messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": anthropicVersion,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
          lastRes = res;

          const raw = await res.text();

          if (!res.ok) {
            let details = raw;
            try {
              const j = JSON.parse(raw);
              details = j.error?.message ?? j.error ?? raw;
            } catch (e) {
              console.error("[DEBUG_LLM] request_error", { error: e });
            }

            const error = new Error(
              `Anthropic API error: ${res.status} ${res.statusText} — ${String(details).slice(0, 500)}`,
            );

            // Don't retry on client errors (4xx) except rate limits
            if (res.status >= 400 && res.status < 500 && res.status !== 429) {
              throw error;
            }

            lastError = error;
            if (attempt < maxRetries) {
              await sleep(getRetryDelayMs(res, attempt));
              continue;
            }
            throw error;
          }

          let data: unknown;
          try {
            data = raw ? JSON.parse(raw) : {};
          } catch (parseError) {
            throw new Error(
              `Failed to parse Anthropic API response: ${parseError}`,
            );
          }

          // Validate response structure
          if (!data || typeof data !== "object") {
            throw new Error("Invalid Anthropic API response: not an object");
          }
          const content = (data as { content?: unknown }).content;
          if (!content || !Array.isArray(content)) {
            throw new Error(
              "Invalid Anthropic API response: missing or invalid content array",
            );
          }

          const { text, tool_calls } = fromAnthropicContent(content);
          const msg: ModelResponse["message"] = {
            role: "assistant",
            content: text,
            ...(tool_calls && tool_calls.length ? { tool_calls } : {}),
          };
          const usage = mapUsage((data as { usage?: unknown }).usage);
          return { message: msg, ...(usage ? { usage } : {}) };
        } finally {
          clearTimeout(timeoutId);
          cleanupAbort();
        }
      } catch (error) {
        lastError = error as Error;

        // Don't retry on non-retryable errors
        if (
          error instanceof Error &&
          (error.name === "AbortError" ||
            error.message.includes("Failed to parse") ||
            error.message.includes("Invalid Anthropic API response"))
        ) {
          throw error;
        }

        if (attempt < maxRetries) {
          await sleep(getRetryDelayMs(lastRes, attempt));
          continue;
        }
        throw error;
      }
    }
    throw lastError!;
  })();
}

function toAnthropicTool(tool: Tool) {
  if (!tool.name) {
    throw new Error("[anthropicAdapter] Tool must have a name");
  }

  return {
    name: tool.name,
    description: tool.description || "",
    input_schema: toJsonSchema((tool as { schema?: unknown }).schema),
  };
}

function toJsonSchema(schema: unknown): Record<string, unknown> {
  if (!schema) return { type: "object" };

  const t = (schema as ZodSchemaLike)?._def?.typeName;

  switch (t) {
    case "ZodString":
      return { type: "string" };
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodArray":
      return {
        type: "array",
        items: toJsonSchema((schema as ZodSchemaLike)?._def?.type),
      };
    case "ZodOptional":
    case "ZodDefault":
      return toJsonSchema((schema as ZodSchemaLike)?._def?.innerType);
    case "ZodObject": {
      const shape =
        typeof (schema as ZodSchemaLike)?._def?.shape === "function"
          ? (schema as { _def?: { shape?: () => unknown } })._def?.shape?.()
          : (schema as ZodSchemaLike)?._def?.shape;
      const props: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, val] of Object.entries(
        (shape as Record<string, unknown>) ?? {},
      )) {
        props[key] = toJsonSchema(val);
        const innerTypeName = (val as ZodSchemaLike)?._def?.typeName;
        if (innerTypeName !== "ZodOptional" && innerTypeName !== "ZodDefault") {
          required.push(key);
        }
      }

      return {
        type: "object",
        properties: props,
        ...(required.length ? { required } : {}),
      };
    }
    case "ZodEnum":
      return {
        type: "string",
        enum: ((schema as ZodSchemaLike)?._def?.values as unknown[]) || [],
      };
    case "ZodLiteral":
      return {
        type:
          typeof (schema as ZodSchemaLike)?._def?.value === "string"
            ? "string"
            : "number",
        enum: [
          (schema as ZodSchemaLike)?._def?.value as string | number | undefined,
        ],
      };
    default:
      return { type: "object" };
  }
}

function normalizeToolChoice(
  choice: GenerateOptions["toolChoice"],
  hasTools: boolean,
): AnthropicToolChoice | undefined {
  if (!choice || !hasTools) return undefined;

  if (choice === "auto") return { type: "auto" };
  if (choice === "none") return { type: "none" };

  // Specific tool choice
  return {
    type: "tool",
    name: typeof choice === "string" ? choice : undefined,
  };
}

export function toAnthropicMessage(m: Message): AnthropicMessage {
  const anyM = m as Message & {
    tool_calls?: ToolCallLike[];
    tool_call_id?: string;
    name?: string;
    content?: unknown;
  };

  if (m.role === "assistant") {
    const content: AnthropicContentBlock[] = [];

    if (anyM.content) {
      content.push({ type: "text", text: String(anyM.content) });
    }

    if (Array.isArray(anyM.tool_calls)) {
      for (const tc of anyM.tool_calls) {
        if (!tc.id || !tc.name) {
          console.warn(
            "[anthropicAdapter] Tool call missing required id or name",
          );
          continue;
        }
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: tc.arguments ?? {},
        });
      }
    }

    return { role: "assistant", content };
  }

  if (m.role === "tool") {
    const toolCallId = anyM.tool_call_id ?? anyM.name;
    if (!toolCallId) {
      throw new Error(
        "[anthropicAdapter] Tool message must have tool_call_id or name",
      );
    }

    return {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolCallId,
          content: String(anyM.content ?? ""),
        },
      ],
    };
  }

  // user or others
  return {
    role: "user",
    content: toAnthropicInputContent(anyM),
  };
}

async function toAnthropicMessageAsync(
  m: Message,
  signal?: AbortSignal,
): Promise<AnthropicMessage> {
  const anyM = m as Message & {
    content?: unknown;
    contentParts?: unknown;
    images?: unknown;
    image_urls?: unknown;
    image_url?: unknown;
    image?: unknown;
  };

  if (m.role === "user") {
    return {
      role: "user",
      content: await toAnthropicInputContentAsync(anyM, signal),
    };
  }

  return toAnthropicMessage(m);
}

function toAnthropicInputContent(m: {
  content?: unknown;
  contentParts?: unknown;
  images?: unknown;
  image_urls?: unknown;
  image_url?: unknown;
  image?: unknown;
}): AnthropicContentBlock[] {
  const rawParts = collectRawParts(m);
  const out: AnthropicContentBlock[] = [];

  for (const p of rawParts) {
    const normalized = normalizeAnthropicPartSync(p);
    if (!normalized) continue;
    out.push(normalized);
  }

  if (out.length === 0) {
    return [{ type: "text", text: String(m.content ?? "") }];
  }

  return out;
}

async function toAnthropicInputContentAsync(
  m: {
    content?: unknown;
    contentParts?: unknown;
    images?: unknown;
    image_urls?: unknown;
    image_url?: unknown;
    image?: unknown;
  },
  signal?: AbortSignal,
): Promise<AnthropicContentBlock[]> {
  const rawParts = collectRawParts(m);
  const out: AnthropicContentBlock[] = [];

  for (const p of rawParts) {
    const normalized = await normalizeAnthropicPartAsync(p, signal);
    if (!normalized) continue;
    out.push(normalized);
  }

  if (out.length === 0) {
    return [{ type: "text", text: String(m.content ?? "") }];
  }

  return out;
}

function collectRawParts(m: {
  content?: unknown;
  contentParts?: unknown;
  images?: unknown;
  image_urls?: unknown;
  image_url?: unknown;
  image?: unknown;
}): unknown[] {
  if (Array.isArray(m.content)) return m.content;
  if (Array.isArray(m.contentParts)) return m.contentParts;

  const parts: unknown[] = [];
  if (typeof m.content === "string" && m.content.length > 0) {
    parts.push({ type: "text", text: m.content });
  }

  const images: unknown[] = [];
  if (Array.isArray(m.images)) images.push(...m.images);
  if (Array.isArray(m.image_urls)) images.push(...m.image_urls);
  if (m.image_url !== undefined) images.push(m.image_url);
  if (m.image !== undefined) images.push(m.image);

  for (const image of images) {
    parts.push({ type: "image_url", image_url: image });
  }

  return parts;
}

function normalizeAnthropicPartSync(
  part: unknown,
): AnthropicInputContentPart | undefined {
  return normalizeAnthropicPartCore(part, false);
}

async function normalizeAnthropicPartAsync(
  part: unknown,
  signal?: AbortSignal,
): Promise<AnthropicInputContentPart | undefined> {
  const normalized = normalizeAnthropicPartCore(part, true);
  if (!normalized || normalized.type !== "image") return normalized;

  if (!normalized.source.data.startsWith("__HTTP_URL__:")) {
    return normalized;
  }

  const url = normalized.source.data.slice("__HTTP_URL__:".length);
  const resolved = await toAnthropicImageSourceAsync(url, signal);
  return { type: "image", source: resolved };
}

function normalizeAnthropicPartCore(
  part: unknown,
  allowHttpPlaceholder: boolean,
): AnthropicInputContentPart | undefined {
  if (typeof part === "string") return { type: "text", text: part };
  if (!part || typeof part !== "object") return undefined;

  const obj = part as Record<string, unknown>;
  const t = obj.type;

  if (t === "text") {
    if (typeof obj.text !== "string") {
      throw new Error(
        "[anthropicAdapter] Invalid text content part: expected string text",
      );
    }
    return { type: "text", text: obj.text };
  }

  if (t === "image") {
    if (typeof obj.url === "string") {
      return normalizeImageValueToPart(obj.url, allowHttpPlaceholder);
    }
    if (typeof obj.image_url === "string") {
      return normalizeImageValueToPart(obj.image_url, allowHttpPlaceholder);
    }
    if (
      obj.image_url &&
      typeof obj.image_url === "object" &&
      typeof (obj.image_url as { url?: unknown }).url === "string"
    ) {
      return normalizeImageValueToPart(obj.image_url, allowHttpPlaceholder);
    }

    const source = obj.source;
    if (!source || typeof source !== "object") {
      throw new Error(
        "[anthropicAdapter] Invalid image content part: expected source object",
      );
    }
    const s = source as Record<string, unknown>;
    if (s.type !== "base64") {
      throw new Error(
        "[anthropicAdapter] Unsupported image source type: expected base64",
      );
    }
    if (typeof s.media_type !== "string" || !s.media_type.startsWith("image/")) {
      throw new Error(
        "[anthropicAdapter] Invalid image source media_type: expected image/*",
      );
    }
    if (typeof s.data !== "string" || !s.data.trim()) {
      throw new Error(
        "[anthropicAdapter] Invalid image source data: expected non-empty base64 string",
      );
    }
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: s.media_type,
        data: s.data,
      },
    };
  }

  if (t === "image_url") {
    return normalizeImageValueToPart(obj.image_url, allowHttpPlaceholder);
  }
  if (typeof obj.image_url === "string" || typeof obj.image === "string") {
    return normalizeImageValueToPart(
      obj.image_url ?? obj.image,
      allowHttpPlaceholder,
    );
  }
  if (typeof obj.url === "string") {
    return normalizeImageValueToPart(obj.url, allowHttpPlaceholder);
  }

  return undefined;
}

function normalizeImageValueToPart(
  value: unknown,
  allowHttpPlaceholder: boolean,
): AnthropicInputContentPart {
  const raw = imageValueToString(value);
  const source = toAnthropicImageSource(raw, allowHttpPlaceholder);
  return { type: "image", source };
}

function imageValueToString(value: unknown): string {
  if (typeof value === "string") {
    if (!value.trim()) {
      throw new Error("[anthropicAdapter] Invalid image input: empty string");
    }
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    typeof (value as { url?: unknown }).url === "string"
  ) {
    const url = (value as { url: string }).url;
    if (!url.trim()) {
      throw new Error("[anthropicAdapter] Invalid image input: empty url");
    }
    return url;
  }

  throw new Error(
    "[anthropicAdapter] Invalid image input: expected string or { url: string }",
  );
}

function toAnthropicImageSource(
  input: string,
  allowHttpPlaceholder = false,
): AnthropicImageSource {
  const trimmed = input.trim();

  if (isDataUrl(trimmed)) {
    const parsed = parseDataUrl(trimmed);
    return {
      type: "base64",
      media_type: parsed.mediaType,
      data: parsed.data,
    };
  }

  if (isHttpUrl(trimmed)) {
    if (!allowHttpPlaceholder) {
      throw new Error(
        "[anthropicAdapter] Remote image URLs are not supported in sync message mapping. Pass data URLs or base64 image data.",
      );
    }
    return {
      type: "base64",
      media_type: "image/jpeg",
      data: `__HTTP_URL__:${trimmed}`,
    };
  }

  if (!isProbablyBase64(trimmed)) {
    throw new Error(
      "[anthropicAdapter] Invalid image input: expected data URL, http(s) URL, or base64 image data",
    );
  }

  return {
    type: "base64",
    media_type: "image/jpeg",
    data: trimmed,
  };
}

async function toAnthropicImageSourceAsync(
  input: string,
  signal?: AbortSignal,
): Promise<AnthropicImageSource> {
  const trimmed = input.trim();
  if (!isHttpUrl(trimmed)) {
    return toAnthropicImageSource(trimmed);
  }

  const res = await fetch(trimmed, { signal });
  if (!res.ok) {
    throw new Error(
      `[anthropicAdapter] Failed to fetch image URL: ${res.status} ${res.statusText}`,
    );
  }

  const ct = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  const mediaType = ct && ct.startsWith("image/") ? ct : "image/jpeg";
  const bytes = new Uint8Array(await res.arrayBuffer());
  const data = Buffer.from(bytes).toString("base64");
  if (!data) {
    throw new Error("[anthropicAdapter] Failed to normalize image URL: empty data");
  }

  return { type: "base64", media_type: mediaType, data };
}

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

function isDataUrl(s: string): boolean {
  return /^data:/i.test(s);
}

function parseDataUrl(s: string): { mediaType: string; data: string } {
  const m = s.match(/^data:(.+?);base64,(.+)$/i);
  if (!m) {
    throw new Error(
      "[anthropicAdapter] Invalid data URL image input: expected data:<mime>;base64,<data>",
    );
  }

  const mediaType = m[1].toLowerCase();
  const data = m[2].trim();
  if (!mediaType.startsWith("image/")) {
    throw new Error(
      `[anthropicAdapter] Invalid image media type in data URL: ${mediaType}`,
    );
  }
  if (!data) {
    throw new Error("[anthropicAdapter] Invalid data URL image input: empty data");
  }
  return { mediaType, data };
}

function isProbablyBase64(s: string): boolean {
  if (!s || /[:/]/.test(s) || /\s/.test(s)) return false;
  if (s.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(s);
}

function bindAbortSignal(
  signal: AbortSignal | undefined,
  controller: AbortController,
): () => void {
  if (!signal) return () => {};
  if (signal.aborted) {
    controller.abort();
    return () => {};
  }
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort);
  return () => signal.removeEventListener("abort", onAbort);
}

function fromAnthropicContent(blocks: unknown[]): {
  text: string;
  tool_calls?: ToolCall[];
} {
  if (!Array.isArray(blocks)) {
    throw new Error("[anthropicAdapter] Expected content to be an array");
  }

  const texts: string[] = [];
  const tool_calls: ToolCall[] = [];

  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    const block = b as {
      type?: string;
      text?: unknown;
      id?: unknown;
      name?: unknown;
      input?: unknown;
    };

    if (block.type === "text" && typeof block.text === "string") {
      texts.push(block.text);
    } else if (block.type === "tool_use") {
      if (typeof block.id !== "string" || typeof block.name !== "string") {
        console.warn(
          "[anthropicAdapter] Tool use block missing required id or name",
        );
        continue;
      }
      tool_calls.push({
        id: block.id,
        name: block.name,
        arguments: block.input ?? {},
      });
    }
  }

  return {
    text: texts.join(""),
    ...(tool_calls.length ? { tool_calls } : {}),
  };
}

function mapUsage(u: unknown): ModelResponse["usage"] | undefined {
  if (!u || typeof u !== "object") return undefined;

  const usage = u as { input_tokens?: unknown; output_tokens?: unknown };
  const prompt = usage.input_tokens;
  const completion = usage.output_tokens;
  const total =
    typeof prompt === "number" && typeof completion === "number"
      ? prompt + completion
      : undefined;

  return {
    promptTokens: typeof prompt === "number" ? prompt : undefined,
    completionTokens: typeof completion === "number" ? completion : undefined,
    totalTokens: typeof total === "number" ? total : undefined,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
