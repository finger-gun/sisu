import type { EmbedOptions, EmbeddingsProvider } from "./types.js";

export interface CreateEmbeddingsClientOptions {
  baseUrl: string;
  model: string;
  apiKey?: string;
  path?: string;
  headers?: Record<string, string>;
  authHeader?: string;
  authScheme?: string;
  clientName?: string;
  buildBody?: (args: { input: string[]; model: string }) => Record<string, unknown>;
  parseResponse?: (raw: string) => number[][];
}

type OpenAICompatibleEmbeddingsResponse = {
  data?: Array<{ embedding?: number[] }>;
};

export function createEmbeddingsClient(
  options: CreateEmbeddingsClientOptions,
): EmbeddingsProvider {
  const clientName = options.clientName ?? "createEmbeddingsClient";
  if (!options.baseUrl) {
    throw new Error(`[${clientName}] baseUrl is required`);
  }
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const path = options.path ?? "/v1/embeddings";
  const authHeader = options.authHeader ?? "Authorization";
  const authScheme = options.authScheme ?? "Bearer ";

  return {
    async embed(input: string[], opts?: EmbedOptions): Promise<number[][]> {
      if (!Array.isArray(input) || input.length === 0) {
        throw new Error(`[${clientName}] input must contain at least one string`);
      }
      if (opts?.signal?.aborted) {
        throw new Error(`[${clientName}] embedding request aborted`);
      }

      const model = opts?.model ?? options.model;
      if (!model) {
        throw new Error(`[${clientName}] model is required`);
      }

      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(options.apiKey
            ? { [authHeader]: `${authScheme}${options.apiKey}` }
            : {}),
          ...(options.headers ?? {}),
        },
        body: JSON.stringify(
          options.buildBody?.({ input, model }) ?? {
            model,
            input,
          },
        ),
        signal: opts?.signal,
      });

      const raw = await response.text();
      if (!response.ok) {
        throw new Error(
          `[${clientName}] API error: ${response.status} ${response.statusText} - ${extractErrorDetails(raw)}`,
        );
      }

      let embeddings: number[][];
      try {
        embeddings = options.parseResponse?.(raw) ?? parseOpenAICompatibleResponse(raw);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "unknown parse error";
        throw new Error(
          `[${clientName}] Failed to parse embeddings response: ${message}`,
        );
      }

      if (embeddings.length !== input.length) {
        throw new Error(
          `[${clientName}] Expected ${input.length} embeddings, received ${embeddings.length}`,
        );
      }

      return embeddings;
    },
  };
}

function parseOpenAICompatibleResponse(raw: string): number[][] {
  const parsed = JSON.parse(raw) as OpenAICompatibleEmbeddingsResponse;
  return (parsed.data ?? []).map((entry) => entry.embedding ?? []);
}

function extractErrorDetails(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string } | string;
      message?: string;
    };
    if (typeof parsed.error === "string") return parsed.error;
    if (parsed.error?.message) return parsed.error.message;
    if (parsed.message) return parsed.message;
  } catch {
    return raw;
  }

  return raw;
}
