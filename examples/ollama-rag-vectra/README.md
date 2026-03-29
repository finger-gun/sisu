# Ollama RAG with Vectra

Demonstrates the same layered RAG workflow as `openai-rag-vectra`, but with a fully local stack:

- `@sisu-ai/rag-core` for developer-controlled ingestion and shared chunking
- `@sisu-ai/tool-rag` for model-facing `retrieveContext` / `storeContext`
- `@sisu-ai/vector-vectra` as a file-backed `VectorStore`
- `@sisu-ai/mw-tool-calling` for model-driven retrieval/storage calls
- Ollama chat adapter + Ollama embeddings adapter

Workflow:
- startup ingestion seeds a local Vectra index folder
- query agent answers by calling RAG tools over that local index

## Why Vectra?

Vectra is a local, file-backed vector store for Node.js. It is a good fit for small, mostly static corpora, demos, tests, and local development where you want no separate vector database service.

## Prerequisites

Start Ollama and pull both a chat model and an embedding model:

```bash
ollama serve
ollama pull llama3.1
ollama pull embeddinggemma
```

If you already use a different local embedding model, set `EMBEDDING_MODEL` instead.

## Run

Set environment:

```bash
export MODEL=llama3.1
export EMBEDDING_MODEL=embeddinggemma
export BASE_URL=http://localhost:11434

# optional overrides
export VECTRA_PATH=examples/ollama-rag-vectra/.vectra
export VECTOR_NAMESPACE=sisu
export QUERY="Which doc talks about Malmö fika?"
```

From repo root:

```bash
pnpm run ex:ollama:rag-vectra
```

Or directly:

```bash
npm run dev -w examples/ollama-rag-vectra
```

## Notes

- No external vector DB is required.
- The example writes a local index folder to `examples/ollama-rag-vectra/.vectra` by default.
- Delete that folder if you want to reset the example state.
- This example uses `embeddinggemma` by default for ingestion and retrieval embeddings.
- Runtime failures are usually local Ollama model availability or base URL configuration issues.
- If you see `model "embeddinggemma" not found`, run `ollama pull embeddinggemma` first.
