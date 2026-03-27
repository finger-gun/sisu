# OpenAI RAG with ChromaDB

Demonstrates a two-agent RAG workflow using:

- `@sisu-ai/rag-core` for developer-controlled ingestion and chunking reuse
- `@sisu-ai/tool-rag` agent tools (`retrieveContext`, `storeContext`)
- `@sisu-ai/vector-chroma` storage adapter via `createChromaVectorStore`
- explicit `storeContext` chunking configuration (`sentences`, overlap `1`, chunk size `120`)
- startup ingestion via `storeRagContent(...)`, reusing the same agnostic chunking strategy as the tool-facing path
- `@sisu-ai/mw-tool-calling` for model-driven retrieval/storage calls
- OpenAI chat adapter + OpenAI embeddings adapter

Workflow:
- Ingestion agent: seeds Chroma with baseline documents.
- Query agent: receives user input, calls retrieval tool, and can persist useful user-provided context for later.

## What is ChromaDB?

ChromaDB is an open‑source embeddings database (vector store) optimized for similarity search and retrieval‑augmented generation (RAG). It stores your vectors + metadata and provides nearest‑neighbor queries over embeddings.

Useful links: https://www.trychroma.com/

## Install and run ChromaDB

You need a Chroma server running and reachable by the example. Two common ways:

- Docker (recommended)

  ```bash
  # Latest image from GitHub Container Registry
  docker run --rm -p 8000:8000 ghcr.io/chroma-core/chroma:latest
  ```

  - Default HTTP endpoint: `http://localhost:8000`
  - For persistence, mount a volume: `-v $(pwd)/chroma-data:/chroma/.chroma/index`

- Python (local install)

  ```bash
  python -m venv .venv && source .venv/bin/activate
  pip install chromadb
  chroma run --host 0.0.0.0 --port 8000
  ```

Either option exposes the same REST API consumed by `ChromaClient`.

## Run

1) Ensure ChromaDB is running locally (default: `http://localhost:8000`).

2) Set environment:

```
export API_KEY=sk-...
export MODEL=gpt-4o-mini
export BASE_URL=https://api.openai.com
# optional overrides
export CHROMA_URL=http://localhost:8000
export VECTOR_NAMESPACE=sisu
# compatibility aliases also work: OPENAI_API_KEY / OPENAI_BASE_URL
```

3) From repo root:

```
npm run ex -w examples/openai-rag-chroma -- "Which doc talks about Malmö fika?"
```

If your runner forwards flags like `--trace`, set query explicitly:

```
QUERY="Which doc talks about Malmö fika?" pnpm ex:openai:rag-chroma
```

Optional embedding override:

```
export EMBEDDING_MODEL=text-embedding-3-small
```

## Troubleshooting

- Connection refused: ensure Chroma is running and `CHROMA_URL` matches the host/port you exposed.
- Empty results: this example ingests a small in-memory dataset at startup; re-run to re-seed if needed.
- SSL/TLS: the quickstarts above run HTTP; if you proxy behind HTTPS, set `CHROMA_URL` accordingly.
- `ECONNREFUSED 127.0.0.1:1234`: your `BASE_URL` likely points at a local service. Set `BASE_URL=https://api.openai.com` (or your intended provider endpoint).
- If you intentionally use a local endpoint at `:1234`, set `ALLOW_LOCAL_BASE_URL=1`.
