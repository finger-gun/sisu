import type { Middleware, Ctx, Message, Tool } from "@sisu-ai/core";
import type { VectorRecord, QueryResult } from "@sisu-ai/vector-core";

type Select<T> = (ctx: Ctx) => T;

type RagState = {
  records?: VectorRecord[];
  queryEmbedding?: number[];
  retrieval?: QueryResult;
  ingested?: unknown;
};

export interface RagIngestOptions {
  toolName?: string; // defaults to vector.upsert
  select?: Select<{ records: VectorRecord[] } | VectorRecord[]>;
}

export const ragIngest =
  (opts: RagIngestOptions = {}): Middleware =>
  async (ctx, next) => {
    const name = opts.toolName || "vector.upsert";
    const tool = ctx.tools.get(name) as Tool | undefined;
    if (!tool)
      throw new Error(
        `ragIngest: missing tool ${name}. Did you register vec-chroma tools?`,
      );
    const sel = opts.select?.(ctx);
    const state = ctx.state as { rag?: RagState };
    const records = Array.isArray(sel)
      ? sel
      : (sel?.records ?? state.rag?.records);
    if (!records || !Array.isArray(records) || records.length === 0)
      throw new Error("ragIngest: no records to upsert");
    const result = await tool.handler({ records }, ctx as Ctx);
    const srag = (state.rag ||= {});
    srag.ingested = result;
    await next();
  };

export interface RagRetrieveOptions {
  toolName?: string; // defaults to vector.query
  topK?: number;
  filter?: Record<string, unknown>;
  select?: Select<
    | { embedding: number[]; topK?: number; filter?: Record<string, unknown> }
    | number[]
  >;
}

export const ragRetrieve =
  (opts: RagRetrieveOptions = {}): Middleware =>
  async (ctx, next) => {
    const name = opts.toolName || "vector.query";
    const tool = ctx.tools.get(name) as Tool | undefined;
    if (!tool)
      throw new Error(
        `ragRetrieve: missing tool ${name}. Did you register vec-chroma tools?`,
      );
    const sel = opts.select?.(ctx);
    const state = ctx.state as { rag?: RagState };
    const embedding = Array.isArray(sel)
      ? sel
      : ((sel as { embedding?: number[] })?.embedding ??
        state.rag?.queryEmbedding);
    if (!embedding || !Array.isArray(embedding))
      throw new Error("ragRetrieve: missing query embedding");
    const topK =
      (Array.isArray(sel) ? undefined : (sel as { topK?: number })?.topK) ??
      opts.topK ??
      5;
    const filter =
      (Array.isArray(sel)
        ? undefined
        : (sel as { filter?: Record<string, unknown> })?.filter) ?? opts.filter;
    const result = (await tool.handler(
      { embedding, topK, filter },
      ctx as Ctx,
    )) as QueryResult;
    const srag = (state.rag ||= {});
    srag.retrieval = result;
    ctx.log.debug?.(`[rag] retrieved ${result?.matches?.length || 0} matches`);
    await next();
  };

export interface BuildRagPromptOptions<TSel = unknown> {
  template?: string;
  select?: Select<TSel>;
}

const DEFAULT_TEMPLATE = `SYSTEM: You are an accurate assistant with RAG capabilities.
Use the provided context to answer if possible.
If the answer isn't in the context, continue with best effort based on your training data or available tools.

CONTEXT:
{{context}}

QUESTION:
{{question}}`;

export const buildRagPrompt =
  <TSel = unknown>(opts: BuildRagPromptOptions<TSel> = {}): Middleware =>
  async (ctx, next) => {
    const t = opts.template || DEFAULT_TEMPLATE;
    const sel = opts.select?.(ctx) as
      | {
          context?: string;
          question?: string;
        }
      | undefined;
    const state = ctx.state as { rag?: RagState };
    const matches = state.rag?.retrieval?.matches || [];
    const contextText =
      sel?.context ??
      matches
        .map(
          (m) =>
            (m.metadata as { text?: string; chunk?: string } | undefined)
              ?.text ||
            (m.metadata as { text?: string; chunk?: string } | undefined)
              ?.chunk ||
            "",
        )
        .filter(Boolean)
        .join("\n\n");
    const question = sel?.question ?? ctx.input ?? "";
    const prompt = t
      .replace("{{context}}", String(contextText || ""))
      .replace("{{question}}", String(question || ""));
    const msg: Message = { role: "system", content: prompt };
    ctx.messages.push(msg);
    ctx.log.debug?.("[rag] message", { msg });
    await next();
  };

export default { ragIngest, ragRetrieve, buildRagPrompt };
