# RAG - Retrieval Augmented Generation

Use RAG middleware to inject relevant context from vector databases or retrieval systems.

## Installation

```bash
pnpm add @sisu-ai/mw-rag
```

## Basic RAG pattern

```typescript
import { rag } from "@sisu-ai/mw-rag";
import { Agent, createCtx } from "@sisu-ai/core";

const app = new Agent()
  .use(errorBoundary())
  .use(
    rag({
      retrieval: (ctx) => ctx.memory.retrieval("docs-index"),
      topK: 3,
      injectMode: "system", // or 'user'
    }),
  )
  .use(inputToMessage)
  .use(conversationBuffer({ window: 8 }))
  .use(async (ctx) => {
    const res = await ctx.model.generate(ctx.messages);
    if (res?.message) ctx.messages.push(res.message);
  });
```

## Using Chroma vector database

```bash
pnpm add @sisu-ai/tool-vec-chroma
```

```typescript
import { vectorChroma } from "@sisu-ai/tool-vec-chroma";
import { rag } from "@sisu-ai/mw-rag";

// Setup Chroma collection
const collection = await vectorChroma.createCollection("docs");
await vectorChroma.addDocuments(collection, [
  { id: "1", text: "Document 1 content...", metadata: {} },
  { id: "2", text: "Document 2 content...", metadata: {} },
]);

// Use in RAG pipeline
const app = new Agent()
  .use(
    rag({
      retrieval: async (ctx) => {
        const query = ctx.input ?? "";
        const results = await vectorChroma.search(collection, query, 3);
        return results.map((r) => r.text);
      },
      topK: 3,
      injectMode: "system",
    }),
  )
  .use(inputToMessage)
  .use(async (ctx) => {
    const res = await ctx.model.generate(ctx.messages);
    if (res?.message) ctx.messages.push(res.message);
  });
```

## Custom retrieval function

```typescript
import { rag } from '@sisu-ai/mw-rag';

const customRetrieval = async (ctx) => {
  const query = ctx.input ?? '';

  // Your custom retrieval logic
  const results = await yourVectorDB.search(query, {
    limit: 5,
    filter: { category: 'technical' }
  });

  return results.map(r => r.content);
};

.use(rag({
  retrieval: customRetrieval,
  topK: 5,
  injectMode: 'user'
}))
```

## Injection modes

### System injection (recommended)

Adds retrieved context to system message:

```typescript
.use(rag({
  retrieval: myRetrieval,
  topK: 3,
  injectMode: 'system'
}))
```

Result:

```typescript
{
  role: 'system',
  content: 'You are a helpful assistant.\n\nRelevant context:\n- Doc 1...\n- Doc 2...'
}
```

### User injection

Adds context to user message:

```typescript
.use(rag({
  retrieval: myRetrieval,
  topK: 3,
  injectMode: 'user'
}))
```

Result:

```typescript
{
  role: 'user',
  content: 'Context:\n- Doc 1...\n\nUser question: What is...?'
}
```

## Dynamic retrieval based on context

```typescript
const dynamicRetrieval = async (ctx) => {
  // Check conversation history to determine what to retrieve
  const lastMessage = ctx.messages.at(-1);
  const topic = extractTopic(lastMessage?.content);

  // Retrieve documents relevant to the topic
  const results = await vectorDB.search(ctx.input ?? '', {
    filter: { topic },
    limit: 3
  });

  return results.map(r => r.text);
};

.use(rag({
  retrieval: dynamicRetrieval,
  topK: 3
}))
```

## Conditional RAG

Only retrieve when needed:

```typescript
import { branch } from '@sisu-ai/mw-control-flow';

const needsRetrieval = (ctx) => {
  return /documentation|how to|what is/i.test(ctx.input ?? '');
};

const withRAG = sequence([
  rag({ retrieval: myRetrieval, topK: 3 }),
  generateResponse
]);

const withoutRAG = sequence([
  generateResponse
]);

.use(branch(needsRetrieval, withRAG, withoutRAG))
```

## Complete example

```typescript
import { Agent, createCtx } from "@sisu-ai/core";
import { openAIAdapter } from "@sisu-ai/adapter-openai";
import { rag } from "@sisu-ai/mw-rag";
import { errorBoundary } from "@sisu-ai/mw-error-boundary";
import {
  inputToMessage,
  conversationBuffer,
} from "@sisu-ai/mw-conversation-buffer";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";

// Mock retrieval system
const mockRetrieval = async (ctx) => {
  const query = ctx.input ?? "";

  // Simulate vector search
  const docs = [
    "Sisu is a TypeScript framework for AI agents.",
    "Use middleware to compose agent pipelines.",
    "Tools are defined with Zod schemas.",
  ];

  return docs;
};

const ctx = createCtx({
  model: openAIAdapter({ model: "gpt-4o-mini" }),
  input: "How do I define tools in Sisu?",
  systemPrompt: "You are a helpful coding assistant.",
});

const app = new Agent()
  .use(errorBoundary())
  .use(traceViewer())
  .use(
    rag({
      retrieval: mockRetrieval,
      topK: 3,
      injectMode: "system",
    }),
  )
  .use(inputToMessage)
  .use(conversationBuffer({ window: 8 }))
  .use(async (ctx) => {
    const res = await ctx.model.generate(ctx.messages, {
      signal: ctx.signal,
    });
    if (res?.message) ctx.messages.push(res.message);
  });

await app.handler()(ctx);
```

## Best practices

1. **Use system injection** for most cases - keeps user message clean
2. **Limit topK to 3-5** documents to avoid context bloat
3. **Filter retrieved docs** by relevance score threshold
4. **Include metadata** (source, timestamp) with documents
5. **Test retrieval quality** separately from LLM generation
6. **Cache embeddings** for frequently accessed documents
7. **Use hybrid search** (vector + keyword) for better recall

## Common mistakes

### ❌ Retrieving too many documents

```typescript
// WRONG - too much context
.use(rag({ retrieval: myRetrieval, topK: 20 }))

// CORRECT
.use(rag({ retrieval: myRetrieval, topK: 3 }))
```

### ❌ Not handling empty results

```typescript
// WRONG - doesn't handle no results
const retrieval = async (ctx) => {
  const results = await vectorDB.search(ctx.input);
  return results.map((r) => r.text);
};

// CORRECT - graceful fallback
const retrieval = async (ctx) => {
  const results = await vectorDB.search(ctx.input);
  if (results.length === 0) {
    return ["No relevant documentation found."];
  }
  return results.map((r) => r.text);
};
```

### ❌ Including entire documents

```typescript
// WRONG - entire document in context
return [fullDocument];

// CORRECT - extract relevant chunks
return [relevantChunk1, relevantChunk2, relevantChunk3];
```

## External docs

- [RAG middleware README](https://github.com/finger-gun/sisu/tree/main/packages/middleware/rag)
- [RAG example with Chroma](https://github.com/finger-gun/sisu/tree/main/examples/openai-rag-chroma)
- [Vector tools](https://github.com/finger-gun/sisu/tree/main/packages/tools/vec-chroma)
