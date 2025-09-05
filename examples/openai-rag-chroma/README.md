# OpenAI RAG with ChromaDB

Demonstrates a minimal RAG flow using:

- `@sisu-ai/tool-vec-chroma` tools (`vector.upsert`, `vector.query`)
- `@sisu-ai/mw-rag` middlewares (`ragIngest`, `ragRetrieve`, `buildRagPrompt`)
- OpenAI adapter to synthesize the final answer

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
export OPENAI_API_KEY=sk-...
# optional overrides
export CHROMA_URL=http://localhost:8000
export VECTOR_NAMESPACE=sisu
```

3) From repo root:

```
npm run ex -w examples/openai-rag-chroma -- "Which doc talks about Malmö fika?"
```

## Troubleshooting

- Connection refused: ensure Chroma is running and `CHROMA_URL` matches the host/port you exposed.
- Empty results: this example ingests a small in‑memory dataset on startup; re‑run to re‑seed if needed.
- SSL/TLS: the quickstarts above run HTTP; if you proxy behind HTTPS, set `CHROMA_URL` accordingly.
