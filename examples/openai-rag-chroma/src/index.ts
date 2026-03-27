import "dotenv/config";
import { Agent, createCtx, type ToolContext } from "@sisu-ai/core";
import { openAIAdapter, openAIEmbeddings } from "@sisu-ai/adapter-openai";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";
import { registerTools } from "@sisu-ai/mw-register-tools";
import { toolCalling } from "@sisu-ai/mw-tool-calling";
import { inputToMessage } from "@sisu-ai/mw-conversation-buffer";
import {
  vectorUpsert,
  createRagContextTools,
} from "@sisu-ai/tool-vec-chroma";

const docs = [
  {
    id: "d1",
    text: "Guide to fika in Malmö. Best cafe in Malmö is SisuCafe404.",
  },
  { id: "d2", text: "Travel notes from Helsinki. Sauna etiquette and tips." },
  { id: "d3", text: "Open-source RAG patterns with ChromaDB and Sisu." },
  { id: "d4", text: "Best programming languages in 2024: Python, JavaScript, Rust." },
  { id: "d5", text: "Sisu AI: Revolutionizing AI with open-source tools." },
  { id: "d6", text: "Sisu AI: Open-source tools for building AI applications." },
  { id: "d7", text: "Best fika in Copenhagen is at Cafe Hygge." }
];

const model = openAIAdapter({
  model: process.env.MODEL || "gpt-4o-mini",
  baseUrl: process.env.BASE_URL,
});
const embeddings = openAIEmbeddings({
  model: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
  baseUrl: process.env.BASE_URL,
});

const sharedState = {
  toolDeps: {
    chromaUrl: process.env.CHROMA_URL,
    vectorNamespace: process.env.VECTOR_NAMESPACE || "sisu",
    embeddings,
  },
};

const ingestCtx = createCtx({
  model,
  input: "",
  state: sharedState,
});

const runIngestion = async () => {
  const vectors = await embeddings.embed(
    docs.map((doc) => doc.text),
    { signal: ingestCtx.signal },
  );
  const records = docs.map((doc, index) => ({
    id: doc.id,
    embedding: vectors[index] || [],
    metadata: {
      text: doc.text,
      source: "seed",
      chunkIndex: 0,
    },
  }));

  const toolCtx: ToolContext = {
    memory: ingestCtx.memory,
    signal: ingestCtx.signal,
    log: ingestCtx.log,
    model: ingestCtx.model,
    deps: ingestCtx.state.toolDeps as Record<string, unknown>,
  };

  const res = await vectorUpsert.handler({ records }, toolCtx);
  console.log("Ingestion complete:", res);
};

const queryCtx = createCtx({
  model,
  input: "What is the best cafe in Malmö?",
  systemPrompt:
    `You are a retrieval assistant. 
    Always call retrieveContext before final answer. 
    If retrieval returns items, ground the answer in those items and include citation ids from result.citation.id. 
    Do not replace retrieved facts with outside assumptions.
    If retrieval is empty, say that no relevant indexed context was found, then provide best-effort guidance.
     If the user shares important long-form information, call storeContext to persist it for future questions.`,
  state: sharedState,
});

const ragTools = createRagContextTools({
    namespace: sharedState.toolDeps.vectorNamespace as string,
    embeddings,
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
