# @sisu-ai/tool-rag

Backend-agnostic RAG tools for agents.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![CodeQL](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Ftool-rag)](https://www.npmjs.com/package/@sisu-ai/tool-rag)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

## Exports

- `createRetrieveTool`
- `createStoreTool`
- `createRagTools`

Type exports are re-exposed for convenience, but reusable chunking and ingestion mechanics live in `@sisu-ai/rag-core`.

## Philosophy

`@sisu-ai/tool-rag` is the model-facing layer of the RAG stack.

- It is where tool schemas, names, and descriptions live.
- It stays thin by delegating the actual chunking, embeddings orchestration, and vector-store work to `@sisu-ai/rag-core`.
- It works with any `VectorStore` implementation that satisfies `@sisu-ai/vector-core`.

## Composition

`@sisu-ai/tool-rag` expects:

- `embeddings` provider (`embed(input[]) => vectors[]`)
- `vectorStore` implementation (`upsert`, `query`)

Use backend adapters such as `@sisu-ai/vector-chroma` to provide `vectorStore`.

For startup seeding, chunking helpers, and developer-controlled ingestion, use `@sisu-ai/rag-core` directly.

## How It Resolves Dependencies

You can provide dependencies in two ways:

- directly in tool options
- indirectly through `ctx.deps`

That means the same tool factory works for:

- explicitly wired apps
- middleware/orchestration flows that inject dependencies into tool context

## Typical Usage

```ts
import { createRagTools } from '@sisu-ai/tool-rag';
import { createChromaVectorStore } from '@sisu-ai/vector-chroma';

const vectorStore = createChromaVectorStore({ namespace: 'docs' });

const ragTools = createRagTools({
  embeddings,
  vectorStore,
  store: {
    chunkingStrategy: 'sentences',
    chunkSize: 400,
    overlap: 1,
  },
});
```

This gives the model:

- `retrieveContext` for query-text retrieval
- `storeContext` for communication-derived persistence

## When To Use This Package

- You want the model to decide when to retrieve context.
- You want the model to store user-provided information for later retrieval.
- You want backend-agnostic RAG tools rather than provider-specific ones.

## When Not To Use This Package

- You want app-controlled ingestion or retrieval without tool-calling; use `@sisu-ai/rag-core`.
- You want deterministic middleware composition; use `@sisu-ai/mw-rag`.

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
