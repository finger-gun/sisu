# OpenAI RAG with Vectra

Demonstrates the same layered RAG workflow as `openai-rag-chroma`, but with a zero-infrastructure local vector backend:

- `@sisu-ai/rag-core` for developer-controlled ingestion and shared chunking
- `@sisu-ai/tool-rag` for model-facing `retrieveContext` / `storeContext`
- `@sisu-ai/vector-vectra` as a file-backed `VectorStore`
- `@sisu-ai/mw-tool-calling` for model-driven retrieval/storage calls
- OpenAI chat adapter + OpenAI embeddings adapter

Workflow:
- startup ingestion seeds a local Vectra index folder
- query agent answers by calling RAG tools over that local index

## Why Vectra?

Vectra is a local, file-backed vector store for Node.js. It is a good fit for small, mostly static corpora, demos, tests, and local development where you want no separate vector database service.

## Run

Set environment:

```bash
export API_KEY=sk-...
export MODEL=gpt-4o-mini
export BASE_URL=https://api.openai.com

# optional overrides
export VECTRA_PATH=examples/openai-rag-vectra/.vectra
export VECTOR_NAMESPACE=sisu
export QUERY="Which doc talks about Malmö fika?"
export EMBEDDING_MODEL=text-embedding-3-small
```

From repo root:

```bash
pnpm run ex:openai:rag-vectra
```

Or directly:

```bash
npm run dev -w examples/openai-rag-vectra
```

## Notes

- No external vector DB is required.
- The example writes a local index folder to `examples/openai-rag-vectra/.vectra` by default.
- Delete that folder if you want to reset the example state.
- As with the Chroma example, any later runtime failure after startup is usually provider/network configuration, not the vector backend.
