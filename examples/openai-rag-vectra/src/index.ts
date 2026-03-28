import path from "node:path";
import "dotenv/config";
import { Agent, createCtx } from "@sisu-ai/core";
import { openAIAdapter, openAIEmbeddings } from "@sisu-ai/adapter-openai";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";
import { registerTools } from "@sisu-ai/mw-register-tools";
import { toolCalling } from "@sisu-ai/mw-tool-calling";
import { inputToMessage } from "@sisu-ai/mw-conversation-buffer";
import { storeRagContent } from "@sisu-ai/rag-core";
import { createRagTools } from "@sisu-ai/tool-rag";
import { createVectraVectorStore } from "@sisu-ai/vector-vectra";
import { docs } from "./docs";

const model = openAIAdapter({
  model: process.env.MODEL || "gpt-4o-mini",
  baseUrl: process.env.BASE_URL,
});
const embeddings = openAIEmbeddings({
  model: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
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
    "You are a travel assistant. Use RAG to fetch latest information before answering.",
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
  .use(toolCalling);

await runIngestion();
await queryAgent.handler()(queryCtx);

const final = queryCtx.messages.filter((message) => message.role === "assistant").pop();
console.log("\nAssistant:\n", final?.content);
