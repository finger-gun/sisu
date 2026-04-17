import path from "node:path";
import "dotenv/config";
import { Agent, createCtx, execute, getExecutionResult } from "@sisu-ai/core";
import { ollamaAdapter, ollamaEmbeddings } from "@sisu-ai/adapter-ollama";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";
import { registerTools } from "@sisu-ai/mw-register-tools";
import { inputToMessage } from "@sisu-ai/mw-conversation-buffer";
import { storeRagContent } from "@sisu-ai/rag-core";
import { createRagTools } from "@sisu-ai/tool-rag";
import { createVectraVectorStore } from "@sisu-ai/vector-vectra";
import { docs } from "./docs";

const model = ollamaAdapter({
  model: process.env.MODEL || "gemma4:e4b",
  baseUrl: process.env.BASE_URL,
});
const embeddings = ollamaEmbeddings({
  model: process.env.EMBEDDING_MODEL || "embeddinggemma",
  baseUrl: process.env.BASE_URL,
});

const namespace = process.env.VECTOR_NAMESPACE || "sisu";
const vectorStore = createVectraVectorStore({
  folderPath:
    process.env.VECTRA_PATH || path.join(process.cwd(), ".vectra"),
  namespace,
  indexedMetadataFields: ["docId", "source", "kind", "chunkIndex"],
});

const storeOptions = {
  chunkingStrategy: "sentences" as const,
  chunkSize: 120,
  overlap: 1,
  maxChunks: 16,
};

const ingestCtx = createCtx({
  model,
  input: "",
});

const runIngestion = async () => {
  const results = await Promise.all(
    docs.map((doc) =>
      storeRagContent({
        content: doc.text,
        source: "seed",
        metadata: { docId: doc.id },
        idPrefix: doc.id,
        namespace,
        embeddings,
        vectorStore,
        signal: ingestCtx.signal,
        ...storeOptions,
      }),
    ),
  );
  const stored = results.reduce((sum, result) => sum + result.stored, 0);
  console.log("Ingestion complete:", { documents: docs.length, stored });
};

const queryCtx = createCtx({
  model,
  input: process.env.QUERY || "What is the best cafe in Malmö?",
  systemPrompt:
    "You are a travel assistant. Use RAG to fetch relevant information before answering.",
});

const ragTools = createRagTools({
  namespace,
  embeddings,
  vectorStore,
  store: storeOptions,
});

const queryAgent = new Agent()
  .use(traceViewer())
  .use(registerTools(ragTools))
  .use(inputToMessage)
  .use(execute);

try {
  await runIngestion();
  await queryAgent.handler()(queryCtx);
  console.log("\nAssistant:\n", getExecutionResult(queryCtx)?.text);
} catch (error) {
  if (
    error instanceof Error &&
    /model ".+" not found, try pulling it first/i.test(error.message)
  ) {
    const missingModel =
      error.message.match(/model "([^"]+)" not found/i)?.[1] ||
      process.env.EMBEDDING_MODEL ||
      "embeddinggemma";
    console.error("\n❌ Ollama model not found:", missingModel);
    console.error("💡 Pull the required models first:");
    console.error(`   ollama pull ${process.env.MODEL || "gemma4:e4b"}`);
    console.error(`   ollama pull ${missingModel}`);
    console.error(
      "   Or set EMBEDDING_MODEL to a local embedding model you already have.",
    );
    process.exit(1);
  }

  throw error;
}
