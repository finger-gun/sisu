# RAG - Retrieval Augmented Generation

Sisu keeps RAG split into small layers instead of one monolithic package.

## RAG stack

- `@sisu-ai/vector-core` defines the shared `VectorStore` contract
- `@sisu-ai/vector-chroma` implements that contract for Chroma
- `@sisu-ai/vector-vectra` implements that contract for local file-backed Vectra indexes
- `@sisu-ai/rag-core` owns chunking, embeddings orchestration, and direct store/retrieve helpers
- `@sisu-ai/tool-rag` exposes model-facing `retrieveContext` / `storeContext`
- `@sisu-ai/mw-rag` composes deterministic middleware-driven retrieval over a `VectorStore`

Use the package that matches the layer you actually need.

## Tool-driven RAG

Use this when the model should decide when to retrieve or store context.

```bash
pnpm add @sisu-ai/rag-core
pnpm add @sisu-ai/tool-rag
pnpm add @sisu-ai/vector-chroma
```

```typescript
import { Agent, execute } from "@sisu-ai/core";
import { openAIEmbeddings } from "@sisu-ai/adapter-openai";
import { inputToMessage } from "@sisu-ai/mw-conversation-buffer";
import { registerTools } from "@sisu-ai/mw-register-tools";
import { storeRagContent } from "@sisu-ai/rag-core";
import { createRagTools } from "@sisu-ai/tool-rag";
import { createChromaVectorStore } from "@sisu-ai/vector-chroma";

const embeddings = openAIEmbeddings({ model: "text-embedding-3-small" });
const vectorStore = createChromaVectorStore({ namespace: "docs" });

await storeRagContent({
  content: "Sisu keeps packages small and composable.",
  source: "seed",
  idPrefix: "doc-1",
  embeddings,
  vectorStore,
  chunkingStrategy: "sentences",
  chunkSize: 400,
  overlap: 1,
});

const ragTools = createRagTools({
  embeddings,
  vectorStore,
  namespace: "docs",
  store: { chunkingStrategy: "sentences", chunkSize: 400, overlap: 1 },
});

const app = new Agent()
  .use(registerTools(ragTools))
  .use(inputToMessage)
  .use(execute);
```

Switch to Vectra for local file-backed storage:

```typescript
import { createVectraVectorStore } from "@sisu-ai/vector-vectra";

const vectorStore = createVectraVectorStore({
  folderPath: ".vectra",
  namespace: "docs",
});
```

## Middleware-driven RAG

Use this when your app already computes embeddings and you want deterministic retrieval + prompt shaping.

```bash
pnpm add @sisu-ai/mw-rag
pnpm add @sisu-ai/vector-core
```

```typescript
import { Agent } from "@sisu-ai/core";
import { ragIngest, ragRetrieve, buildRagPrompt } from "@sisu-ai/mw-rag";

const app = new Agent()
  .use(ragIngest({ vectorStore }))
  .use(ragRetrieve({ vectorStore, topK: 3 }))
  .use(buildRagPrompt());
```

`@sisu-ai/mw-rag` does not chunk or embed for you. Prepare `VectorRecord[]` and query embeddings in your own code, then let middleware handle retrieval and prompt assembly.

## Choosing a backend

### Chroma

Use Chroma when you want a dedicated vector database service:

```typescript
import { createChromaVectorStore } from "@sisu-ai/vector-chroma";

const vectorStore = createChromaVectorStore({
  chromaUrl: process.env.CHROMA_URL,
  namespace: "docs",
});
```

### Vectra

Use Vectra when you want a local file-backed vector index with no extra server:

```typescript
import { createVectraVectorStore } from "@sisu-ai/vector-vectra";

const vectorStore = createVectraVectorStore({
  folderPath: ".vectra",
  namespace: "docs",
});
```

Namespaces map to folders with Vectra and to backend collections with Chroma.

## Package boundaries

- Put reusable chunking and ingestion logic in `@sisu-ai/rag-core`
- Put model-facing tools in `@sisu-ai/tool-rag`
- Put deterministic retrieval middleware in `@sisu-ai/mw-rag`
- Put backend-specific SDK concerns in `@sisu-ai/vector-*`

If a design mixes those responsibilities, it is probably fighting the framework.

## Example references

- [RAG example with Chroma](https://github.com/finger-gun/sisu/tree/main/examples/openai-rag-chroma)
- [RAG example with Vectra](https://github.com/finger-gun/sisu/tree/main/examples/openai-rag-vectra)
- [RAG middleware package docs](https://github.com/finger-gun/sisu/tree/main/packages/middleware/rag)
- [RAG core package docs](https://github.com/finger-gun/sisu/tree/main/packages/rag/core)
