# @sisu-ai/mw-rag

Compose retrieval-augmented generation pipelines by connecting vector retrieval outputs to prompting.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![CodeQL](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fmw-rag)](https://www.npmjs.com/package/@sisu-ai/mw-rag)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

## Exports
- `ragIngest({ vectorStore, namespace?, select? })`
  - `vectorStore`: required `VectorStore` implementation.
  - `namespace`: optional default namespace.
  - `select(ctx)`: return `{ records, namespace? }` or `VectorRecord[]` to ingest.
- `ragRetrieve({ vectorStore, namespace?, topK?, filter?, select? })`
  - `vectorStore`: required `VectorStore` implementation.
  - `namespace`: optional default namespace.
  - `topK`: default 5; also accepted via `select`.
  - `filter`: provider-specific filter object to pass to the query.
  - `select(ctx)`: return `{ embedding, topK?, filter?, namespace? }` or `number[]`.
- `buildRagPrompt({ template?, select? })`
  - `template`: customize the system prompt; uses a sensible default.
  - `select(ctx)`: return `{ context?, question? }` to override defaults.

State used under `ctx.state.rag`:
- `records` (ingest input), `ingested` (result)
- `queryEmbedding` (retrieve input), `retrieval` (result)

## Choosing a Package
- Use `@sisu-ai/rag-core` when app code needs reusable chunking, embedding orchestration, seeding, or direct store/retrieve helpers.
- Use `@sisu-ai/tool-rag` when the model should call `retrieveContext` / `storeContext` as tools.
- Use `@sisu-ai/mw-rag` when your app already owns embeddings and vector writes/queries, and you want a deterministic middleware pipeline that turns retrieval into prompt context.
- `@sisu-ai/mw-rag` no longer depends on low-level vector tool registration.


## What It Does
- `ragIngest` upserts your prepared documents into a vector index via a `VectorStore`.
- `ragRetrieve` queries nearest neighbors using an embedding for the current question.
- `buildRagPrompt` turns retrieval results into a grounded system prompt that precedes your user question.

It wires the minimum state in `ctx.state.rag` so you can compose ingestion, retrieval, and prompting without monolithic code.

`@sisu-ai/mw-rag` does not own chunking or embedding generation. You prepare `VectorRecord[]` and query embeddings in app code or another layer, then this middleware handles the retrieval/prompting composition.

## How It Works
- Vector operations are provided by a `VectorStore` implementation such as `@sisu-ai/vector-chroma` or `@sisu-ai/vector-vectra`.
- You provide inputs via `ctx.state.rag` or `select` callbacks:
  - `rag.records`: `VectorRecord[]` for ingestion.
  - `rag.queryEmbedding`: `number[]` representing the query embedding.
- Retrieval matches are placed at `rag.retrieval`. `buildRagPrompt` formats these into a context block and appends a system message to `ctx.messages`.

For agent-facing retrieval/storage tools that handle chunking and embedding orchestration, prefer `@sisu-ai/tool-rag` composed with a backend adapter such as `@sisu-ai/vector-chroma` or `@sisu-ai/vector-vectra`.

For app-side seeding and reusable chunking/embedding mechanics outside tool-calling, use `@sisu-ai/rag-core` directly.

## When To Use `@sisu-ai/mw-rag`
- You want deterministic, middleware-driven RAG rather than model tool-calling.
- You already compute embeddings in your own code and want to keep that explicit.
- You want prompt injection based on retrieval results without exposing storage/retrieval tools to the model.
- You want to compose retrieval with other middleware such as guardrails, orchestration, or prompt shaping.

## When Not To Use `@sisu-ai/mw-rag`
- You want the model to decide when to retrieve or store context; use `@sisu-ai/tool-rag`.
- You want reusable app-side ingestion helpers; use `@sisu-ai/rag-core`.
- You only need backend access or maintenance operations; use a backend adapter such as `@sisu-ai/vector-chroma` or `@sisu-ai/vector-vectra` directly.

## Example
_Exampls using ChromaDb_
```ts
import 'dotenv/config';
import { Agent, createConsoleLogger, InMemoryKV, NullStream, SimpleTools, type Ctx } from '@sisu-ai/core';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { ragIngest, ragRetrieve, buildRagPrompt } from '@sisu-ai/mw-rag';
import { createChromaVectorStore } from '@sisu-ai/vector-chroma';

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
const vectorStore = createChromaVectorStore({ namespace: process.env.VECTOR_NAMESPACE || 'sisu' });

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
  .use(ragIngest({ vectorStore }))
  .use(ragRetrieve({ vectorStore, topK: 2 }))
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

---

## Documentation

**Core** — [Package docs](packages/core/README.md) · [Error types](packages/core/ERROR_TYPES.md)

**Adapters** — [OpenAI](packages/adapters/openai/README.md) · [Anthropic](packages/adapters/anthropic/README.md) · [Ollama](packages/adapters/ollama/README.md)

<details>
<summary>All middleware packages</summary>

- [@sisu-ai/mw-agent-run-api](packages/middleware/agent-run-api/README.md)
- [@sisu-ai/mw-context-compressor](packages/middleware/context-compressor/README.md)
- [@sisu-ai/mw-control-flow](packages/middleware/control-flow/README.md)
- [@sisu-ai/mw-conversation-buffer](packages/middleware/conversation-buffer/README.md)
- [@sisu-ai/mw-cors](packages/middleware/cors/README.md)
- [@sisu-ai/mw-error-boundary](packages/middleware/error-boundary/README.md)
- [@sisu-ai/mw-guardrails](packages/middleware/guardrails/README.md)
- [@sisu-ai/mw-invariants](packages/middleware/invariants/README.md)
- [@sisu-ai/mw-orchestration](packages/middleware/orchestration/README.md)
- [@sisu-ai/mw-rag](packages/middleware/rag/README.md)
- [@sisu-ai/mw-react-parser](packages/middleware/react-parser/README.md)
- [@sisu-ai/mw-register-tools](packages/middleware/register-tools/README.md)
- [@sisu-ai/mw-tool-calling](packages/middleware/tool-calling/README.md)
- [@sisu-ai/mw-trace-viewer](packages/middleware/trace-viewer/README.md)
- [@sisu-ai/mw-usage-tracker](packages/middleware/usage-tracker/README.md)
</details>

<details>
<summary>All tool packages</summary>

- [@sisu-ai/tool-aws-s3](packages/tools/aws-s3/README.md)
- [@sisu-ai/tool-azure-blob](packages/tools/azure-blob/README.md)
- [@sisu-ai/tool-extract-urls](packages/tools/extract-urls/README.md)
- [@sisu-ai/tool-github-projects](packages/tools/github-projects/README.md)
- [@sisu-ai/tool-rag](packages/tools/rag/README.md)
- [@sisu-ai/tool-summarize-text](packages/tools/summarize-text/README.md)
- [@sisu-ai/tool-terminal](packages/tools/terminal/README.md)
- [@sisu-ai/tool-web-fetch](packages/tools/web-fetch/README.md)
- [@sisu-ai/tool-web-search-duckduckgo](packages/tools/web-search-duckduckgo/README.md)
- [@sisu-ai/tool-web-search-google](packages/tools/web-search-google/README.md)
- [@sisu-ai/tool-web-search-openai](packages/tools/web-search-openai/README.md)
- [@sisu-ai/tool-wikipedia](packages/tools/wikipedia/README.md)
</details>

<details>
<summary>All RAG packages</summary>

- [@sisu-ai/rag-core](packages/rag/core/README.md)
</details>

<details>
<summary>All vector packages</summary>

- [@sisu-ai/vector-core](packages/vector/core/README.md)
- [@sisu-ai/vector-chroma](packages/vector/chroma/README.md)
- [@sisu-ai/vector-vectra](packages/vector/vectra/README.md)
</details>

<details>
<summary>All examples</summary>

**Anthropic** — [hello](examples/anthropic-hello/README.md) · [control-flow](examples/anthropic-control-flow/README.md) · [stream](examples/anthropic-stream/README.md) · [weather](examples/anthropic-weather/README.md)

**Ollama** — [hello](examples/ollama-hello/README.md) · [stream](examples/ollama-stream/README.md) · [vision](examples/ollama-vision/README.md) · [weather](examples/ollama-weather/README.md) · [web-search](examples/ollama-web-search/README.md)

**OpenAI** — [hello](examples/openai-hello/README.md) · [weather](examples/openai-weather/README.md) · [stream](examples/openai-stream/README.md) · [vision](examples/openai-vision/README.md) · [reasoning](examples/openai-reasoning/README.md) · [react](examples/openai-react/README.md) · [control-flow](examples/openai-control-flow/README.md) · [branch](examples/openai-branch/README.md) · [parallel](examples/openai-parallel/README.md) · [graph](examples/openai-graph/README.md) · [orchestration](examples/openai-orchestration/README.md) · [orchestration-adaptive](examples/openai-orchestration-adaptive/README.md) · [guardrails](examples/openai-guardrails/README.md) · [error-handling](examples/openai-error-handling/README.md) · [rag-chroma](examples/openai-rag-chroma/README.md) · [rag-vectra](examples/openai-rag-vectra/README.md) · [web-search](examples/openai-web-search/README.md) · [web-fetch](examples/openai-web-fetch/README.md) · [wikipedia](examples/openai-wikipedia/README.md) · [terminal](examples/openai-terminal/README.md) · [github-projects](examples/openai-github-projects/README.md) · [server](examples/openai-server/README.md) · [aws-s3](examples/openai-aws-s3/README.md) · [azure-blob](examples/openai-azure-blob/README.md)
</details>

---

## Contributing

We build Sisu in the open. Contributions welcome.

[Contributing Guide](CONTRIBUTING.md) · [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md) · [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md) · [Code of Conduct](CODE_OF_CONDUCT.md)

---

<div align="center">

**[Star on GitHub](https://github.com/finger-gun/sisu)** if Sisu helps you build better agents.

*Quiet, determined, relentlessly useful.*

[Apache 2.0 License](LICENSE)

</div>
