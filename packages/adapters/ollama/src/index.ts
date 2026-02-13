import type {
  LLM,
  Message,
  ModelResponse,
  GenerateOptions,
  Tool,
  ModelEvent,
  ToolCall,
} from "@sisu-ai/core";
import { firstConfigValue } from "@sisu-ai/core";

type OllamaToolCall = {
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

type OllamaChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  images?: string[];
  name?: string;
  tool_call_id?: string;
  tool_calls?: OllamaToolCall[];
};

export function ollamaAdapter(opts: OllamaAdapterOptions): LLM {
  const envBase = firstConfigValue(["OLLAMA_BASE_URL", "BASE_URL"]);
  const baseUrl = (opts.baseUrl ?? envBase ?? "http://localhost:11434").replace(
    /\/$/,
    "",
  );
  const modelName = `ollama:${opts.model}`;

  const generate = ((
    messages: Message[],
    genOpts?: GenerateOptions,
  ): Promise<ModelResponse> | AsyncIterable<ModelEvent> => {
    // Map messages to Ollama format; include assistant tool_calls and tool messages
    async function mapMessagesWithImages(): Promise<OllamaChatMessage[]> {
      const out: OllamaChatMessage[] = [];
      for (const m of messages) {
        const base: OllamaChatMessage = { role: m.role };
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
            id: tc.id,
            type: "function",
            function: { name: tc.name, arguments: tc.arguments ?? {} },
          }));
          const ti = buildTextAndImages(anyM);
          base.content =
            ti.content ?? (m.content !== undefined ? m.content : null);
          if (ti.images?.length) base.images = await toBase64Images(ti.images);
        } else if (m.role === "tool") {
          base.content = String(m.content ?? "");
          if (m.tool_call_id) base.tool_call_id = m.tool_call_id;
          if (m.name && !m.tool_call_id) base.name = m.name;
        } else {
          const ti = buildTextAndImages(anyM);
          base.content = ti.content ?? m.content ?? "";
          if (ti.images?.length) base.images = await toBase64Images(ti.images);
          if (m.name) base.name = m.name;
        }
        out.push(base);
      }
      return out;
    }

    if (genOpts?.stream === true) {
      return (async function* () {
        const toolsParam = (genOpts?.tools ?? []).map(toOllamaTool);
        const mapped = await mapMessagesWithImages();
        const baseBody: Record<string, unknown> = {
          model: opts.model,
          messages: mapped,
        };
        if (toolsParam.length) baseBody.tools = toolsParam;
        const res = await fetch(`${baseUrl}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...(opts.headers ?? {}),
          },
          body: JSON.stringify({ ...baseBody, stream: true }),
        });
        if (!res.ok || !res.body) {
          const err = await res.text();
          throw new Error(
            `Ollama API error: ${res.status} ${res.statusText} — ${String(err).slice(0, 500)}`,
          );
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
            if (!line.trim()) continue;
            try {
              const j = JSON.parse(line);
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
            } catch (e: unknown) {
              console.error("[DEBUG_LLM] stream_parse_error", { error: e });
            }
          }
        }
      })();
    }

    // Non-stream path
    return (async () => {
      const toolsParam = (genOpts?.tools ?? []).map(toOllamaTool);
      const mapped = await mapMessagesWithImages();
      const baseBody: Record<string, unknown> = {
        model: opts.model,
        messages: mapped,
      };
      if (toolsParam.length) baseBody.tools = toolsParam;
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(opts.headers ?? {}),
        },
        body: JSON.stringify({ ...baseBody, stream: false }),
      });
      const raw = await res.text();
      if (!res.ok) {
        let details = raw;
        try {
          const j = JSON.parse(raw);
          details = j.error ?? j.message ?? raw;
        } catch (e: unknown) {
          console.error("[DEBUG_LLM] request_error", { error: e });
        }
        throw new Error(
          `Ollama API error: ${res.status} ${res.statusText} — ${String(details).slice(0, 500)}`,
        );
      }
      const data: Record<string, unknown> = raw ? JSON.parse(raw) : {};
      const choice =
        (data as { message?: { content?: unknown; tool_calls?: unknown } })
          .message ?? {};
      const content = (choice as { content?: unknown }).content;
      const tcs = Array.isArray((choice as { tool_calls?: unknown }).tool_calls)
        ? (choice as { tool_calls: OllamaToolCall[] }).tool_calls
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
    })();
  }) as LLM["generate"];

  return {
    name: modelName,
    capabilities: { functionCall: true, streaming: true },
    generate,
  };
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

async function toBase64Images(images: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const src of images) out.push(await toBase64(src));
  return out;
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

async function toBase64(src: string): Promise<string> {
  if (isDataUrl(src)) return fromDataUrl(src);
  if (isHttpUrl(src)) {
    const res = await fetch(src);
    if (!res.ok)
      throw new Error(`Failed to fetch image: ${res.status} ${res.statusText}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.toString("base64");
  }
  return isProbablyBase64(src) ? src : src;
}
