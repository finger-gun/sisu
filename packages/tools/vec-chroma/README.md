# @sisu-ai/tool-vec-chroma
[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Ftool-vec-chroma)](https://www.npmjs.com/package/@sisu-ai/tool-vec-chroma)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

ChromaDB adapter tools for Sisu vectors. Provides three tools:

- `vector.upsert(records)` — add/update embeddings
- `vector.query({ embedding, topK, filter? })` — nearest neighbors
- `vector.delete({ ids })` — remove entries

Environment:
- `CHROMA_URL` (default: `http://localhost:8000`)
- Optional: `state.vectorNamespace` to override collection name (default: `sisu`)

Register tools via `@sisu-ai/mw-register-tools`:

```ts
import { registerTools } from '@sisu-ai/mw-register-tools';
import { vectorTools } from '@sisu-ai/tool-vec-chroma';
agent.use(registerTools(vectorTools));
```

# Community & Support
- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
