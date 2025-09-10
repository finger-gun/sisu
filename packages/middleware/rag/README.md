# @sisu-ai/mw-rag

RAG-oriented middlewares for Sisu that glue vector tools to LLM prompting.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fmw-rag)](https://www.npmjs.com/package/@sisu-ai/mw-rag)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

## Exports
- `ragIngest({ toolName?, select? })`
  - `toolName`: override the tool (default `vector.upsert`).
  - `select(ctx)`: return `{ records }` or `VectorRecord[]` to ingest.
- `ragRetrieve({ toolName?, topK?, filter?, select? })`
  - `toolName`: override the tool (default `vector.query`).
  - `topK`: default 5; also accepted via `select`.
  - `filter`: provider-specific filter object to pass to the tool.
  - `select(ctx)`: return `{ embedding, topK?, filter? }` or `number[]`.
- `buildRagPrompt({ template?, select? })`
  - `template`: customize the system prompt; uses a sensible default.
  - `select(ctx)`: return `{ context?, question? }` to override defaults.

State used under `ctx.state.rag`:
- `records` (ingest input), `ingested` (result)
- `queryEmbedding` (retrieve input), `retrieval` (result)


## What It Does
- `ragIngest` upserts your prepared documents into a vector index via a registered vector tool.
- `ragRetrieve` queries nearest neighbors using an embedding for the current question.
- `buildRagPrompt` turns retrieval results into a grounded system prompt that precedes your user question.

It wires the minimum state in `ctx.state.rag` so you can compose ingestion, retrieval, and prompting without monolithic code.

## How It Works
- Vector operations are provided by tools you register (e.g., `@sisu-ai/tool-vec-chroma`).
  - `ragIngest` calls a tool named `vector.upsert` by default.
  - `ragRetrieve` calls a tool named `vector.query` by default.
- You provide inputs via `ctx.state.rag` or `select` callbacks:
  - `rag.records`: `VectorRecord[]` for ingestion.
  - `rag.queryEmbedding`: `number[]` representing the query embedding.
- Retrieval matches are placed at `rag.retrieval`. `buildRagPrompt` formats these into a context block and appends a system message to `ctx.messages`.

## Example
_Exampls using ChromaDb_
```ts
import 'dotenv/config';
import { Agent, createConsoleLogger, InMemoryKV, NullStream, SimpleTools, type Ctx } from '@sisu-ai/core';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { registerTools } from '@sisu-ai/mw-register-tools';
import { ragIngest, ragRetrieve, buildRagPrompt } from '@sisu-ai/mw-rag';
import { vectorTools } from '@sisu-ai/tool-vec-chroma';

// Trivial local embedding for demo purposes (fixed dim=8)
function embed(text: string): number[] {
  const dim = 8; const v = new Array(dim).fill(0);
  for (const w of text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
    let h = 0; for (let i = 0; i < w.length; i++) h = (h * 31 + w.charCodeAt(i)) >>> 0;
    v[h % dim] += 1;
  }
  // L2 normalize
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1; return v.map(x => x / norm);
}

const model = openAIAdapter({ model: 'gpt-4o-mini' });
const query = 'Best fika in Malmö?';

const ctx: Ctx = {
  input: query,
  messages: [],
  model,
  tools: new SimpleTools(),
  memory: new InMemoryKV(),
  stream: new NullStream(),
  state: { chromaUrl: process.env.CHROMA_URL, vectorNamespace: process.env.VECTOR_NAMESPACE || 'sisu' },
  signal: new AbortController().signal,
  log: createConsoleLogger({ level: 'info' }),
};

const docs = [
  { id: 'd1', text: 'Guide to fika in Malmö. Best cafe in Malmö is SisuCafe404.' },
  { id: 'd2', text: 'Travel notes from Helsinki. Sauna etiquette and tips.' },
];

(ctx.state as any).rag = {
  records: docs.map(d => ({ id: d.id, embedding: embed(d.text), metadata: { text: d.text } })),
  queryEmbedding: embed(query),
};

const app = new Agent()
  .use(registerTools(vectorTools))
  .use(ragIngest())
  .use(ragRetrieve({ topK: 2 }))
  .use(buildRagPrompt());
```

## Placement & Ordering
- Ingest rarely (batch or startup), retrieve per-query; you can split pipelines for ingestion and query-time retrieval.
- Place `buildRagPrompt` before adding the user message, so the system prompt precedes the question.
- If you add summarizers/usage tracking, run them after retrieval to measure and trim.

## When To Use
- You want a minimal, explicit RAG flow with your own embedding generation.
- You prefer composing small middlewares over a large RAG framework.

## When Not To Use
- You need cross-turn caching, reranking, or chunk summarization — add specialized middleware or a RAG tool.
- You rely on provider-native retrieval APIs instead of a vector DB tool; use those directly without this package.

# Community & Support

Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu. Example projects live under [`examples/`](https://github.com/finger-gun/sisu/tree/main/examples) in the repo.

- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
