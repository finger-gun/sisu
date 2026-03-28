import path from 'node:path';
import 'dotenv/config';
import { Agent, createCtx } from '@sisu-ai/core';
import { openAIAdapter, openAIEmbeddings } from '@sisu-ai/adapter-openai';
import { inputToMessage } from '@sisu-ai/mw-conversation-buffer';
import { registerTools } from '@sisu-ai/mw-register-tools';
import { toolCalling } from '@sisu-ai/mw-tool-calling';
import { storeRagContent } from '@sisu-ai/rag-core';
import { createRagTools } from '@sisu-ai/tool-rag';
import { createVectraVectorStore } from '@sisu-ai/vector-vectra';

const docs = [
  {
    id: 'sisu-1',
    text: 'Sisu is a TypeScript framework for building reliable AI agents with middleware, tools, adapters, and strong observability.',
  },
  {
    id: 'sisu-2',
    text: 'Sisu works well when you want explicit package boundaries, composable middleware, and controllable tool-calling behavior.',
  },
];

const model = openAIAdapter({
  model: process.env.MODEL || 'gpt-4o-mini',
  baseUrl: process.env.BASE_URL,
});
const embeddings = openAIEmbeddings({
  model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
  baseUrl: process.env.BASE_URL,
});

const namespace = process.env.VECTOR_NAMESPACE || 'docs';
const vectorStore = createVectraVectorStore({
  folderPath: path.join(process.cwd(), '.vectra'),
  namespace,
});

for (const doc of docs) {
  await storeRagContent({
    content: doc.text,
    source: 'seed',
    idPrefix: doc.id,
    namespace,
    embeddings,
    vectorStore,
    chunkingStrategy: 'sentences',
    chunkSize: 240,
    maxChunks: 8,
  });
}

const ragTools = createRagTools({
  namespace,
  embeddings,
  vectorStore,
  store: { chunkingStrategy: 'sentences', chunkSize: 240, maxChunks: 8 },
});

const ctx = createCtx({
  model,
  input: process.argv.slice(2).join(' ') || 'What is Sisu best suited for?',
  systemPrompt: 'You are a helpful assistant. Use retrieval before answering detailed questions.',
});

const app = new Agent()
  .use(registerTools(ragTools))
  .use(inputToMessage)
  .use(toolCalling);

await app.handler()(ctx);
console.log(ctx.messages.at(-1)?.content);
