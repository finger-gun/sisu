# @sisu-ai/vector-chroma

Chroma vector-store adapter for Sisu RAG composition.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![CodeQL](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fvector-chroma)](https://www.npmjs.com/package/@sisu-ai/vector-chroma)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

## Exports

- `createChromaVectorStore`

The created adapter exposes `upsert`, `query`, and `delete`, and is intended to be injected into backend-agnostic RAG tools such as `@sisu-ai/tool-rag`.

For reusable chunking, record preparation, and app-side seeding flows, pair this adapter with `@sisu-ai/rag-core`.

## Philosophy

`@sisu-ai/vector-chroma` is a backend adapter package.

- It should only know how to talk to Chroma.
- It should not own agent-facing tool behavior.
- It should not own generic RAG chunking or prompt logic.

That separation keeps backend swaps straightforward later.

## How It Fits In The Stack

Typical composition looks like this:

- `@sisu-ai/vector-core` defines the `VectorStore` contract
- `@sisu-ai/vector-chroma` implements the contract for Chroma
- `@sisu-ai/rag-core` uses the contract for reusable ingestion/retrieval mechanics
- `@sisu-ai/tool-rag` uses `rag-core` to expose model-facing tools
- `@sisu-ai/mw-rag` can use the same `VectorStore` directly in middleware flows

## Typical Usage

### With `@sisu-ai/rag-core`

```ts
import { storeRagContent } from '@sisu-ai/rag-core';
import { createChromaVectorStore } from '@sisu-ai/vector-chroma';

const vectorStore = createChromaVectorStore({
  chromaUrl: process.env.CHROMA_URL,
  namespace: 'docs',
});

await storeRagContent({
  content: 'Sisu uses small, composable packages.',
  embeddings,
  vectorStore,
});
```

### With `@sisu-ai/tool-rag`

```ts
import { createRagTools } from '@sisu-ai/tool-rag';
import { createChromaVectorStore } from '@sisu-ai/vector-chroma';

const ragTools = createRagTools({
  embeddings,
  vectorStore: createChromaVectorStore({ namespace: 'docs' }),
});
```

### With `@sisu-ai/mw-rag`

```ts
import { ragIngest, ragRetrieve } from '@sisu-ai/mw-rag';
import { createChromaVectorStore } from '@sisu-ai/vector-chroma';

const vectorStore = createChromaVectorStore({ namespace: 'docs' });

agent
  .use(ragIngest({ vectorStore }))
  .use(ragRetrieve({ vectorStore, topK: 4 }));
```

## Using This As The Template For New Providers

If you add another backend, the pattern is:

1. create a new `vector-*` package
2. implement the `VectorStore` contract from `@sisu-ai/vector-core`
3. keep backend SDK details inside that package only
4. reuse it from `rag-core`, `tool-rag`, and `mw-rag`

`@sisu-ai/vector-chroma` is the example implementation of that pattern.

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
