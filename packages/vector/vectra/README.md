# @sisu-ai/vector-vectra

Vectra vector-store adapter for Sisu RAG composition.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![CodeQL](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fvector-vectra)](https://www.npmjs.com/package/@sisu-ai/vector-vectra)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

## Exports

- `createVectraVectorStore`

The created adapter exposes `upsert`, `query`, and `delete`, and is intended to be injected into backend-agnostic RAG tools such as `@sisu-ai/tool-rag`.

For reusable chunking, record preparation, and app-side seeding flows, pair this adapter with `@sisu-ai/rag-core`.

## Philosophy

`@sisu-ai/vector-vectra` owns only Vectra-specific translation.

- It implements the shared `VectorStore` contract from `@sisu-ai/vector-core`.
- It does not own chunking, prompt shaping, or tool schemas.
- It uses Vectra `LocalIndex`, which fits Sisu's existing split where `@sisu-ai/rag-core` already owns chunking and embeddings orchestration.

## Setup

```bash
npm i @sisu-ai/vector-vectra vectra
```

## Usage

```ts
import { openAIEmbeddings } from '@sisu-ai/adapter-openai';
import { storeRagContent } from '@sisu-ai/rag-core';
import { createVectraVectorStore } from '@sisu-ai/vector-vectra';

const embeddings = openAIEmbeddings({ model: 'text-embedding-3-small' });
const vectorStore = createVectraVectorStore({
  folderPath: '.vectra',
  namespace: 'travel',
  indexedMetadataFields: ['docId', 'source'],
});

await storeRagContent({
  content: 'Malmö fika notes go here.',
  source: 'seed',
  metadata: { docId: 'malmo-guide' },
  embeddings,
  vectorStore,
  namespace: 'travel',
});
```

## Namespaces

Vectra has no built-in namespace primitive, so this adapter maps each namespace to its own local folder under `folderPath`.

- base `folderPath`: `.vectra`
- namespace `travel`: `.vectra/travel`
- namespace `docs`: `.vectra/docs`

Queries against a namespace that has not been written yet return an empty match set.

## Metadata

- Scalar metadata values are stored directly.
- Non-scalar metadata values are JSON-stringified before persistence.
- Filterable fields should be listed in `indexedMetadataFields` when creating the adapter.

This keeps Vectra-specific metadata constraints inside the adapter package instead of leaking into `rag-core` or `tool-rag`.

## How It Fits With The RAG Stack

- `@sisu-ai/vector-core` defines the shared storage contract
- `@sisu-ai/vector-vectra` implements that contract with file-backed local indexes
- `@sisu-ai/rag-core` handles chunking and direct store/retrieve flows
- `@sisu-ai/tool-rag` exposes model-facing retrieval/storage tools
- `@sisu-ai/mw-rag` composes deterministic middleware-driven retrieval over any `VectorStore`

---

## Contributing

We build Sisu in the open. Contributions welcome.

[Contributing Guide](CONTRIBUTING.md) · [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md) · [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md) · [Code of Conduct](CODE_OF_CONDUCT.md)

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

---

<div align="center">

**[Star on GitHub](https://github.com/finger-gun/sisu)** if Sisu helps you build better agents.

*Quiet, determined, relentlessly useful.*

[Apache 2.0 License](LICENSE)

</div>
