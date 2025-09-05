# @sisu-ai/mw-rag
[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fmw-rag)](https://www.npmjs.com/package/@sisu-ai/mw-rag)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

RAG-oriented middlewares for Sisu that glue vector tools to LLM prompting.

- `ragIngest({ select? })` — upserts prepared `VectorRecord[]` via `vector.upsert`.
- `ragRetrieve({ topK, filter?, select? })` — queries nearest neighbors via `vector.query`.
- `buildRagPrompt({ template?, select? })` — builds a grounded system prompt from retrieval.

Stores intermediate state under `ctx.state.rag`:
- `records` (ingest input), `ingested` (tool result)
- `queryEmbedding` (retrieve input), `retrieval` (query result)

Example usage with Chroma tools:

```ts
import { registerTools } from '@sisu-ai/mw-register-tools';
import { vectorTools } from '@sisu-ai/tool-vec-chroma';
import { ragIngest, ragRetrieve, buildRagPrompt } from '@sisu-ai/mw-rag';

agent
  .use(registerTools(vectorTools))
  .use(ragIngest())
  .use(ragRetrieve({ topK: 3 }))
  .use(buildRagPrompt());
```

# Community & Support
- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
