# @sisu-ai/vector-core

Provider‑agnostic vector types and math helpers for Sisu. Keep vector tools and middleware portable across providers.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fvector-core)](https://www.npmjs.com/package/@sisu-ai/vector-core)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

## Setup
```bash
npm i @sisu-ai/vector-core
```

## What It Provides
- Types used by vector tools/middleware:
  - `Embedding` — `number[]`
  - `VectorRecord` — `{ id, embedding, metadata?, namespace? }`
  - `QueryRequest` — `{ embedding, topK, filter?, namespace? }`
  - `QueryResult` — `{ matches: Array<{ id, score, metadata? }> }`
- Math helpers for local operations:
  - `dot(a,b)`, `l2Norm(v)`, `normalize(v)`, `cosineSimilarity(a,b)`

## Typical Usage
- With vector tools (e.g., `@sisu-ai/tool-vec-chroma`) and RAG middleware (`@sisu-ai/mw-rag`).

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

## Integration With RAG Middleware
Used by `@sisu-ai/mw-rag`:
- `ragIngest()` expects `ctx.state.rag.records: VectorRecord[]`
- `ragRetrieve()` expects `ctx.state.rag.queryEmbedding: Embedding`
- Stores retrieval at `ctx.state.rag.retrieval: QueryResult`

See examples in `examples/openai-rag-chroma`.

## Notes
- Namespaces: optional per‑provider routing. If you don’t need them, omit.
- Filters: `QueryRequest.filter` is an open object passed through to the tool/provider; shape depends on the adapter.
- Dimensions: math helpers require same‑dimensional vectors and guard against zero vectors for normalization/cosine.

# Community & Support
- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
