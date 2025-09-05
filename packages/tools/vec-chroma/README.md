# @sisu-ai/vec-chroma

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
import { vectorTools } from '@sisu-ai/vec-chroma';
agent.use(registerTools(vectorTools));
```

