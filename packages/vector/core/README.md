# @sisu-ai/vector-core

Share provider-agnostic vector types and math utilities across Sisu vector tools and middleware.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![CodeQL](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fvector-core)](https://www.npmjs.com/package/@sisu-ai/vector-core)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

## Setup
```bash
npm i @sisu-ai/vector-core
```

## Philosophy

`@sisu-ai/vector-core` is the storage-contract layer for Sisu.

- It defines the minimal types and interfaces needed to talk to a vector backend.
- It does not know about chunking, embeddings orchestration, prompt building, or model-facing tools.
- It gives backend adapters and higher-level RAG packages a small, explicit contract to share.

This keeps Sisu’s boundaries clean:

- `@sisu-ai/vector-core` defines the contract
- `@sisu-ai/vector-chroma` implements the contract for Chroma
- `@sisu-ai/rag-core` builds reusable RAG mechanics on top of the contract
- `@sisu-ai/tool-rag` exposes model-facing tools on top of `@sisu-ai/rag-core`
- `@sisu-ai/mw-rag` composes deterministic middleware flows on top of a `VectorStore`

## What It Provides

### Contracts
- `Embedding` — `number[]`
- `VectorRecord` — `{ id, embedding, metadata?, namespace? }`
- `QueryRequest` — `{ embedding, topK, filter?, namespace? }`
- `QueryResult` — `{ matches: Array<{ id, score, metadata? }> }`
- `VectorStore` — `{ upsert(...), query(...), delete?(...) }`

### Math helpers
- `dot(a, b)`
- `l2Norm(v)`
- `normalize(v)`
- `cosineSimilarity(a, b)`

## How The Stack Fits Together

The usual stack looks like this:

1. App code or a tool gets embeddings from a provider
2. A `VectorStore` implementation writes or queries vectors
3. `@sisu-ai/rag-core` handles chunking, record preparation, and retrieval shaping
4. `@sisu-ai/tool-rag` or `@sisu-ai/mw-rag` turns that into agent behavior

Example composition:

```ts
import { openAIEmbeddings } from '@sisu-ai/adapter-openai';
import { createChromaVectorStore } from '@sisu-ai/vector-chroma';
import { storeRagContent } from '@sisu-ai/rag-core';
import { createRagTools } from '@sisu-ai/tool-rag';

const embeddings = openAIEmbeddings({ model: 'text-embedding-3-small' });
const vectorStore = createChromaVectorStore({ namespace: 'docs' });

await storeRagContent({
  content: 'Sisu keeps packages small and composable.',
  embeddings,
  vectorStore,
});

const ragTools = createRagTools({ embeddings, vectorStore });
```

Example shape of ingestion records:
```ts
import type { VectorRecord } from '@sisu-ai/vector-core';

const records: VectorRecord[] = [
  { id: 'doc-1', embedding: [/* numbers */], metadata: { text: 'hello' }, namespace: 'myspace' },
  { id: 'doc-2', embedding: [/* numbers */], metadata: { text: 'world' }, namespace: 'myspace' },
];
```

Example query result:
```ts
import type { QueryResult } from '@sisu-ai/vector-core';

const res: QueryResult = {
  matches: [
    { id: 'doc-1', score: 0.92, metadata: { text: 'hello' } },
    { id: 'doc-2', score: 0.87, metadata: { text: 'world' } },
  ]
};
```

## Building a New Vector Provider

To add a new backend, implement `VectorStore` in a `vector-*` package.

Example skeleton:

```ts
import type { VectorStore } from '@sisu-ai/vector-core';

export function createExampleVectorStore(): VectorStore {
  return {
    async upsert({ records, namespace, signal }) {
      return { count: records.length };
    },
    async query({ embedding, topK, filter, namespace, signal }) {
      return { matches: [] };
    },
    async delete({ ids, namespace, signal }) {
      return { count: ids.length };
    },
  };
}
```

That adapter can then be used by:

- `@sisu-ai/rag-core`
- `@sisu-ai/tool-rag`
- `@sisu-ai/mw-rag`

`@sisu-ai/vector-chroma` is the concrete example to follow.

## What Does Not Belong Here

These concerns live elsewhere on purpose:

- chunking and content preparation → `@sisu-ai/rag-core`
- model-facing tools → `@sisu-ai/tool-rag`
- middleware prompt composition → `@sisu-ai/mw-rag`
- backend SDK implementation details → `vector-*` adapter packages

See `examples/openai-rag-chroma` for the full composition path.

## Notes
- Namespaces: optional per‑provider routing. If you don’t need them, omit.
- Filters: `QueryRequest.filter` is an open object passed through to the tool/provider; shape depends on the adapter.
- Dimensions: math helpers require same‑dimensional vectors and guard against zero vectors for normalization/cosine.

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
</details>

<details>
<summary>All examples</summary>

**Anthropic** — [hello](examples/anthropic-hello/README.md) · [control-flow](examples/anthropic-control-flow/README.md) · [stream](examples/anthropic-stream/README.md) · [weather](examples/anthropic-weather/README.md)

**Ollama** — [hello](examples/ollama-hello/README.md) · [stream](examples/ollama-stream/README.md) · [vision](examples/ollama-vision/README.md) · [weather](examples/ollama-weather/README.md) · [web-search](examples/ollama-web-search/README.md)

**OpenAI** — [hello](examples/openai-hello/README.md) · [weather](examples/openai-weather/README.md) · [stream](examples/openai-stream/README.md) · [vision](examples/openai-vision/README.md) · [reasoning](examples/openai-reasoning/README.md) · [react](examples/openai-react/README.md) · [control-flow](examples/openai-control-flow/README.md) · [branch](examples/openai-branch/README.md) · [parallel](examples/openai-parallel/README.md) · [graph](examples/openai-graph/README.md) · [orchestration](examples/openai-orchestration/README.md) · [orchestration-adaptive](examples/openai-orchestration-adaptive/README.md) · [guardrails](examples/openai-guardrails/README.md) · [error-handling](examples/openai-error-handling/README.md) · [rag-chroma](examples/openai-rag-chroma/README.md) · [web-search](examples/openai-web-search/README.md) · [web-fetch](examples/openai-web-fetch/README.md) · [wikipedia](examples/openai-wikipedia/README.md) · [terminal](examples/openai-terminal/README.md) · [github-projects](examples/openai-github-projects/README.md) · [server](examples/openai-server/README.md) · [aws-s3](examples/openai-aws-s3/README.md) · [azure-blob](examples/openai-azure-blob/README.md)
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
