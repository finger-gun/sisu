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
import {
  Ollama,
  type ChatRequest,
  type ChatResponse,
  type Message as OllamaMessage,
  type ToolCall as OllamaSdkToolCall,
} from "ollama";

type OllamaIncomingToolCall = {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: unknown };
};

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

export interface OllamaAdapterOptions {
  model: string;
  baseUrl?: string; // default http://localhost:11434
  headers?: Record<string, string>;
}

export interface OllamaEmbeddingsOptions {
  model: string;
  baseUrl?: string;
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

type OllamaChatMessage = OllamaMessage & {
  tool_call_id?: string;
  name?: string;
};

export function ollamaEmbeddings(
  opts: OllamaEmbeddingsOptions,
): EmbeddingsProvider {
  if (!opts.model) {
    throw new Error("[ollamaEmbeddings] model is required");
  }
  const envBase = firstConfigValue(["BASE_URL", "OLLAMA_BASE_URL"]);
  const baseUrl = resolveBaseUrl(opts.baseUrl, envBase, "http://localhost:11434");

  return createEmbeddingsClient({
    baseUrl,
    path: "/api/embed",
    headers: opts.headers,
    model: opts.model,
    clientName: "ollamaEmbeddings",
    parseResponse: (raw: string) => {
      const parsed = JSON.parse(raw) as { embeddings?: number[][] };
      return parsed.embeddings ?? [];
    },
  });
}

export function ollamaAdapter(opts: OllamaAdapterOptions): LLM {
  const envBase = firstConfigValue(["BASE_URL", "OLLAMA_BASE_URL"]);
  const baseUrl = resolveBaseUrl(opts.baseUrl, envBase, "http://localhost:11434");
  const modelName = `ollama:${opts.model}`;
  const client = new Ollama({
    host: baseUrl,
    headers: opts.headers,
  });

  const generate = ((
    messages: Message[],
    genOpts?: GenerateOptions,
  ): Promise<ModelResponse> | AsyncIterable<ModelEvent> => {
    // Map messages to Ollama format; include assistant tool_calls and tool messages
    async function mapMessagesWithImages(
      signal?: AbortSignal,
    ): Promise<OllamaChatMessage[]> {
      const out: OllamaChatMessage[] = [];
      for (const m of messages) {
        const base: OllamaChatMessage = { role: m.role, content: "" };
        const anyM = m as Message & {
          tool_calls?: ToolCall[];
          contentParts?: unknown;
          images?: unknown;
          image_urls?: unknown;
          image_url?: unknown;
          image?: unknown;
        };
        if (m.role === "assistant" && Array.isArray(anyM.tool_calls)) {
          base.tool_calls = anyM.tool_calls.map((tc) => ({
            function: {
              name: tc.name ?? "",
              arguments: normalizeToolCallArguments(tc.arguments),
            },
          }));
          const ti = buildTextAndImages(anyM);
          base.content = ti.content ?? String(m.content ?? "");
          if (ti.images?.length)
            base.images = await toBase64Images(ti.images, signal);
        } else if (m.role === "tool") {
          base.content = String(m.content ?? "");
          if (m.tool_call_id) base.tool_call_id = m.tool_call_id;
          if (m.name && !m.tool_call_id) base.name = m.name;
        } else {
          const ti = buildTextAndImages(anyM);
          base.content = ti.content ?? String(m.content ?? "");
          if (ti.images?.length)
            base.images = await toBase64Images(ti.images, signal);
          if (m.name) base.name = m.name;
        }
        out.push(base);
      }
      return out;
    }

    if (genOpts?.stream === true) {
      return (async function* () {
        try {
          throwIfAborted(genOpts?.signal);
          const toolsParam = buildOllamaTools(
            genOpts?.tools ?? [],
            genOpts?.toolChoice,
          );
          const mapped = await mapMessagesWithImages(genOpts?.signal);
          const request: ChatRequest & { stream: true } = {
            model: opts.model,
            messages: mapped,
            stream: true,
          };
          if (toolsParam.length) request.tools = [...toolsParam];
          const stream = await withAbortSignal(
            () =>
              client.chat(request) as Promise<
                AsyncIterable<{
                  done?: boolean;
                  message?: { content?: string };
                }>
              >,
            genOpts?.signal,
          );
          let full = "";
          for await (const j of stream) {
            throwIfAborted(genOpts?.signal);
            if (j.done) {
              yield {
                type: "assistant_message",
                message: { role: "assistant", content: full },
              } as ModelEvent;
              return;
            }
            const token = j.message?.content;
            if (typeof token === "string" && token) {
              full += token;
              yield { type: "token", token } as ModelEvent;
            }
          }
        } catch (error) {
          throw mapOllamaError(error);
        }
      })();
    }

    // Non-stream path
    return (async () => {
      const toolsParam = buildOllamaTools(
        genOpts?.tools ?? [],
        genOpts?.toolChoice,
      );
      const mapped = await mapMessagesWithImages(genOpts?.signal);
      const request: ChatRequest & { stream: false } = {
        model: opts.model,
        messages: mapped,
        stream: false,
      };
      if (toolsParam.length) request.tools = [...toolsParam];
      const data = await withAbortSignal(
        () => client.chat(request) as Promise<ChatResponse>,
        genOpts?.signal,
      );
      const choice =
        (data as { message?: { content?: unknown; tool_calls?: unknown } }).message ??
        {};
      const content = (choice as { content?: unknown }).content;
      const tcs = Array.isArray((choice as { tool_calls?: unknown }).tool_calls)
        ? (choice as { tool_calls: OllamaIncomingToolCall[] }).tool_calls
            .map((tc) => ({
              id: tc.id ?? "",
              name: tc.function?.name ?? "",
              arguments: safeJson(tc.function?.arguments),
            }))
            .filter((tc) => tc.id && tc.name)
        : undefined;
      const out: ModelResponse["message"] = {
        role: "assistant",
        content: typeof content === "string" ? content : "",
        ...(tcs ? { tool_calls: tcs } : {}),
      };
      return { message: out };
    })().catch((error) => {
      throw mapOllamaError(error);
    });
  }) as LLM["generate"];

  return {
    name: modelName,
    capabilities: { functionCall: true, streaming: true },
    generate,
  };
}

function mapOllamaError(error: unknown): Error {
  if (error instanceof Error && error.name === "AbortError") {
    return error;
  }
  return error instanceof Error
    ? new Error(`Ollama API error: ${error.message.slice(0, 500)}`)
    : new Error(`Ollama API error: ${String(error).slice(0, 500)}`);
}

function toOllamaTool(tool: Tool) {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: toJsonSchema(tool.schema),
    },
  } as const;
}

function normalizeToolCallArguments(
  args: unknown,
): OllamaSdkToolCall["function"]["arguments"] {
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return args as OllamaSdkToolCall["function"]["arguments"];
  }
  return {};
}

function buildOllamaTools(
  tools: Tool[],
  toolChoice: GenerateOptions["toolChoice"],
): ReadonlyArray<ReturnType<typeof toOllamaTool>> {
  const mapped = tools.map(toOllamaTool);
  if (!mapped.length) return mapped;
  if (!toolChoice || toolChoice === "auto" || toolChoice === "required") {
    return mapped;
  }
  if (toolChoice === "none") return [];
  const selected =
    typeof toolChoice === "string"
      ? toolChoice
      : typeof toolChoice === "object" && typeof toolChoice.name === "string"
        ? toolChoice.name
        : undefined;
  if (!selected) return mapped;
  return mapped.filter((tool) => tool.function.name === selected);
}

function toJsonSchema(schema: unknown): Record<string, unknown> {
  if (!schema) return { type: "object" };
  const t = (schema as ZodSchemaLike)?._def?.typeName;
  if (t === "ZodString") return { type: "string" };
  if (t === "ZodNumber") return { type: "number" };
  if (t === "ZodBoolean") return { type: "boolean" };
  if (t === "ZodArray")
    return {
      type: "array",
      items: toJsonSchema((schema as ZodSchemaLike)?._def?.type),
    };
  if (t === "ZodOptional")
    return toJsonSchema((schema as ZodSchemaLike)?._def?.innerType);
  if (t === "ZodObject") {
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
      if (innerTypeName !== "ZodOptional" && innerTypeName !== "ZodDefault")
        required.push(key);
    }
    return {
      type: "object",
      properties: props,
      ...(required.length ? { required } : {}),
    };
  }
  return { type: "object" };
}

function safeJson(s: unknown): unknown {
  if (typeof s !== "string") return s;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

// Accept OpenAI-style content parts or convenience fields and map to
// Ollama's expected shape: { content: string, images?: string[] }
function buildTextAndImages(m: unknown): {
  content?: string;
  images?: string[];
} {
  if (!m || typeof m !== "object") return {};
  const obj = m as Record<string, unknown>;
  // If content is parts, normalize
  if (Array.isArray(obj.content) || Array.isArray(obj.contentParts)) {
    const parts = Array.isArray(obj.content)
      ? (obj.content as unknown[])
      : (obj.contentParts as unknown[]);
    const texts: string[] = [];
    const images: string[] = [];
    for (const p of parts) {
      if (typeof p === "string") {
        texts.push(p);
        continue;
      }
      if (!p || typeof p !== "object") continue;
      const po = p as Record<string, unknown>;
      const t = po.type as string | undefined;
      if (t === "text" && typeof po.text === "string") {
        texts.push(po.text);
        continue;
      }
      if (t === "image_url") {
        const iu = po.image_url as unknown;
        if (typeof iu === "string") images.push(iu);
        else if (
          iu &&
          typeof iu === "object" &&
          typeof (iu as { url?: unknown }).url === "string"
        )
          images.push(String((iu as { url?: unknown }).url));
        continue;
      }
      if (t === "image" && typeof (po as { url?: unknown }).url === "string") {
        images.push(String((po as { url?: unknown }).url));
        continue;
      }
      if (typeof (po as { image_url?: unknown }).image_url === "string") {
        images.push(String((po as { image_url?: unknown }).image_url));
        continue;
      }
      if (typeof (po as { image?: unknown }).image === "string") {
        images.push(String((po as { image?: unknown }).image));
        continue;
      }
    }
    return {
      content: texts.join("\n\n"),
      images: images.length ? images : undefined,
    };
  }
  // Otherwise, use content string (if any) and collect convenience images
  const images: string[] = [];
  if (Array.isArray(obj.images)) images.push(...(obj.images as string[]));
  if (Array.isArray(obj.image_urls))
    images.push(...(obj.image_urls as string[]));
  if (typeof obj.image_url === "string") images.push(obj.image_url);
  if (typeof obj.image === "string") images.push(obj.image);
  const content = typeof obj.content === "string" ? obj.content : undefined;
  return { content, images: images.length ? images : undefined };
}

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

function isDataUrl(s: string): boolean {
  return /^data:/i.test(s);
}

function fromDataUrl(s: string): string {
  const i = s.indexOf(",");
  return i >= 0 ? s.slice(i + 1) : "";
}

function isProbablyBase64(s: string): boolean {
  if (!s || /[:/]/.test(s)) return false; // exclude URLs
  // Basic base64 check: valid chars and length % 4 == 0
  if (s.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(s);
}

async function toBase64Images(
  images: string[],
  signal?: AbortSignal,
): Promise<string[]> {
  const out: string[] = [];
  for (const src of images) out.push(await toBase64(src, signal));
  return out;
}

async function toBase64(src: string, signal?: AbortSignal): Promise<string> {
  throwIfAborted(signal);
  if (isDataUrl(src)) return fromDataUrl(src);
  if (isHttpUrl(src)) {
    const res = await fetch(src, { signal });
    if (!res.ok)
      throw new Error(`Failed to fetch image: ${res.status} ${res.statusText}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.toString("base64");
  }
  return isProbablyBase64(src) ? src : src;
}

function createAbortError(): Error {
  const DomExceptionCtor = globalThis.DOMException;
  if (typeof DomExceptionCtor === "function") {
    return new DomExceptionCtor("The operation was aborted.", "AbortError");
  }
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError();
}

async function withAbortSignal<T>(
  promiseFactory: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  throwIfAborted(signal);
  if (!signal) return promiseFactory();

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(createAbortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promiseFactory()
      .then((value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      })
      .catch((error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      });
  });
}
