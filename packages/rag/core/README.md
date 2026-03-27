# @sisu-ai/rag-core

Reusable backend-agnostic RAG mechanics for Sisu.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![CodeQL](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Frag-core)](https://www.npmjs.com/package/@sisu-ai/rag-core)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

## Exports

- chunkers: `characterChunker`, `sentenceChunker`, `paragraphChunker`, `getChunker`
- direct helpers: `prepareRagRecords`, `storeRagContent`, `retrieveRagContext`
- types for embeddings providers, chunking, and retrieval/storage results

## Philosophy

`@sisu-ai/rag-core` is where reusable RAG mechanics live.

- It is not a middleware package.
- It is not a model-facing tool package.
- It is not tied to any one vector backend.

Its job is to turn text and embeddings into vector-store operations in a small, composable, backend-agnostic way.

## Package role

Use `@sisu-ai/rag-core` when you need RAG mechanics outside tool-calling, such as startup seeding or developer-controlled ingestion.

- `@sisu-ai/tool-rag` wraps this package for model-facing tool calls
- `@sisu-ai/vector-core` provides vector contracts
- `@sisu-ai/vector-chroma` provides a Chroma-backed `VectorStore`

## What It Owns

- chunking strategies
- text-to-record preparation
- embeddings orchestration
- direct store/query helpers over a `VectorStore`
- retrieval result shaping into compact citation-ready results

## What It Does Not Own

- model-facing tool schemas or descriptions → `@sisu-ai/tool-rag`
- middleware prompt injection → `@sisu-ai/mw-rag`
- vector backend SDK code → `@sisu-ai/vector-chroma` or another `vector-*` package

## Typical Flow

### 1. Prepare records without writing yet

```ts
import { prepareRagRecords } from '@sisu-ai/rag-core';

const prepared = await prepareRagRecords({
  content: 'Long-form content goes here.',
  embeddings,
  chunkingStrategy: 'sentences',
  chunkSize: 400,
  overlap: 1,
});
```

### 2. Store content directly

```ts
import { storeRagContent } from '@sisu-ai/rag-core';

await storeRagContent({
  content: 'Important context to persist.',
  embeddings,
  vectorStore,
  chunkingStrategy: 'sentences',
});
```

### 3. Retrieve context directly

```ts
import { retrieveRagContext } from '@sisu-ai/rag-core';

const result = await retrieveRagContext({
  queryText: 'What does the user prefer?',
  embeddings,
  vectorStore,
  topK: 4,
});
```

## How It Fits With Other Packages

- Use `@sisu-ai/rag-core` directly in app code for ingestion and reusable retrieval logic.
- Use `@sisu-ai/tool-rag` when the model should call storage/retrieval itself.
- Use `@sisu-ai/mw-rag` when the app controls embeddings and retrieval explicitly in middleware.

The same `embeddings` provider and `vectorStore` can be shared across all three.

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
