# @sisu-ai/tool-vec-chroma

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
