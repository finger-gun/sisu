# OpenAI RAG with ChromaDB

Demonstrates a minimal RAG flow using:

- `@sisu-ai/vec-chroma` tools (`vector.upsert`, `vector.query`)
- `@sisu-ai/mw-rag` middlewares (`ragIngest`, `ragRetrieve`, `buildRagPrompt`)
- OpenAI adapter to synthesize the final answer

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

