# Built-in Tools

Pre-built tools for common agent tasks.

## Installation

Each tool is a separate package:

```bash
# Web tools
pnpm add @sisu-ai/tool-web-fetch
pnpm add @sisu-ai/tool-web-search-google
pnpm add @sisu-ai/tool-web-search-duckduckgo
pnpm add @sisu-ai/tool-wikipedia

# Cloud storage
pnpm add @sisu-ai/tool-aws-s3
pnpm add @sisu-ai/tool-azure-blob

# Development
pnpm add @sisu-ai/tool-terminal
pnpm add @sisu-ai/tool-github-projects

# Data processing
pnpm add @sisu-ai/rag-core
pnpm add @sisu-ai/tool-rag
pnpm add @sisu-ai/vector-chroma
pnpm add @sisu-ai/tool-extract-urls
pnpm add @sisu-ai/tool-summarize-text
```

## Web tools

### webFetch - Fetch URL contents

```typescript
import { webFetch } from '@sisu-ai/tool-web-fetch';
import { registerTools } from '@sisu-ai/mw-register-tools';

.use(registerTools([webFetch]))
```

LLM can use: `webFetch({ url: "https://example.com" })`

### webSearchGoogle - Google search

```typescript
import { webSearchGoogle } from '@sisu-ai/tool-web-search-google';

// Requires GOOGLE_API_KEY and GOOGLE_SEARCH_ENGINE_ID
.use(registerTools([webSearchGoogle]))
```

LLM can use: `webSearchGoogle({ query: "Sisu framework" })`

### webSearchDuckDuckGo - Privacy-focused search

```typescript
import { webSearchDuckDuckGo } from '@sisu-ai/tool-web-search-duckduckgo';

.use(registerTools([webSearchDuckDuckGo]))
```

### wikipedia - Search Wikipedia

```typescript
import { wikipedia } from '@sisu-ai/tool-wikipedia';

.use(registerTools([wikipedia]))
```

LLM can use: `wikipedia({ query: "AI agents" })`

## Cloud storage tools

### awsS3 - AWS S3 operations

```typescript
import { awsS3Tool } from '@sisu-ai/tool-aws-s3';

// Requires AWS credentials in environment
.use(registerTools([awsS3Tool]))
```

Operations: list, get, put, delete objects

### azureBlob - Azure Blob Storage

```typescript
import { azureBlobTool } from '@sisu-ai/tool-azure-blob';

// Requires Azure credentials
.use(registerTools([azureBlobTool]))
```

## Development tools

### terminal - Execute shell commands

```typescript
import { terminal } from '@sisu-ai/tool-terminal';

// SECURITY WARNING: Only use with trusted prompts
.use(registerTools([terminal]))
```

LLM can execute: bash, python, npm commands, etc.

**Important**: Terminal access is powerful. Use guardrails:

```typescript
import { guardrails } from '@sisu-ai/mw-guardrails';

.use(guardrails({
  allowedCommands: ['ls', 'cat', 'grep', 'find'],
  timeout: 5000
}))
.use(registerTools([terminal]))
```

### githubProjects - GitHub API access

```typescript
import { githubProjects } from '@sisu-ai/tool-github-projects';

// Requires GITHUB_TOKEN
.use(registerTools([githubProjects]))
```

Operations: list repos, create issues, manage projects

## Data processing tools

### ragTools - Agent-facing RAG tools

```typescript
import { createRagTools } from "@sisu-ai/tool-rag";
import { createChromaVectorStore } from "@sisu-ai/vector-chroma";

const vectorStore = createChromaVectorStore({ namespace: "docs" });
const ragTools = createRagTools({
  embeddings,
  vectorStore,
  store: { chunkingStrategy: "sentences", overlap: 1 },
});

.use(registerTools(ragTools))
```

LLM can use: `retrieveContext({ queryText: "..." })` and `storeContext({ content: "..." })`

### vectorChroma - Chroma backend adapter

```typescript
import { createChromaVectorStore } from "@sisu-ai/vector-chroma";

const vectorStore = createChromaVectorStore({ namespace: "docs" });
```

Use this when app code or middleware such as `@sisu-ai/mw-rag` needs direct backend access without model-facing tools.

### extractUrls - Extract URLs from text

```typescript
import { extractUrls } from '@sisu-ai/tool-extract-urls';

.use(registerTools([extractUrls]))
```

LLM can use: `extractUrls({ text: "Visit https://example.com..." })`

### summarizeText - Summarize long text

```typescript
import { summarizeText } from '@sisu-ai/tool-summarize-text';

.use(registerTools([summarizeText]))
```

## Creating custom tools

```typescript
import { z } from "zod";
import type { Tool } from "@sisu-ai/core";

const myCustomTool: Tool<{ param: string }> = {
  name: "myCustomTool",
  description: "Clear description for the LLM to understand when to use this",
  schema: z.object({
    param: z.string().min(1).describe("What this parameter is for"),
  }),
  handler: async ({ param }, ctx) => {
    // Sandboxed context - has: memory, signal, log, model, deps
    // No access to: tools, messages, state, input, stream

    ctx.log.info("Tool called with", { param });

    // Return serializable data
    return {
      result: `Processed: ${param}`,
    };
  },
};
```

**Tool handler context (sandboxed):**

- ✅ `memory` - Storage access
- ✅ `signal` - AbortSignal for cancellation
- ✅ `log` - Logger
- ✅ `model` - LLM interface
- ✅ `deps` - Optional dependency injection
- ❌ `tools` - Not available (prevents recursive calls)
- ❌ `messages` - Not available (prevents conversation manipulation)
- ❌ `state` - Not available (prevents middleware state access)

## Tool best practices

1. **Descriptive names** - `getWeather` not `weather1`
2. **Clear descriptions** - Help LLM understand when to use
3. **Validate inputs** - Use detailed Zod schemas
4. **Small results** - Return concise, serializable data
5. **Handle errors** - Don't throw, return error objects
6. **Idempotent** - Same input = same output
7. **No side effects** - Or make them explicit in description
8. **Log important events** - Use `ctx.log`
9. **Respect cancellation** - Check `ctx.signal`

## Example: Multi-tool agent

```typescript
import { Agent, createCtx } from "@sisu-ai/core";
import { openAIAdapter } from "@sisu-ai/adapter-openai";
import { registerTools } from "@sisu-ai/mw-register-tools";
import { toolCalling } from "@sisu-ai/mw-tool-calling";
import { webFetch } from "@sisu-ai/tool-web-fetch";
import { webSearchGoogle } from "@sisu-ai/tool-web-search-google";
import { wikipedia } from "@sisu-ai/tool-wikipedia";
import { z } from "zod";

// Custom calculator tool
const calculator: Tool<{ expression: string }> = {
  name: "calculator",
  description: "Evaluate mathematical expressions",
  schema: z.object({
    expression: z.string().describe('Math expression like "2 + 2"'),
  }),
  handler: async ({ expression }) => {
    try {
      // SECURITY: Use safe eval or math parser in production
      const result = eval(expression);
      return { result };
    } catch (err) {
      return { error: "Invalid expression" };
    }
  },
};

const ctx = createCtx({
  model: openAIAdapter({ model: "gpt-4o-mini" }),
  input: 'Search for "Sisu AI framework" and summarize the top result',
  systemPrompt: "You are a research assistant with web access.",
});

const app = new Agent()
  .use(errorBoundary())
  .use(traceViewer())
  .use(registerTools([webFetch, webSearchGoogle, wikipedia, calculator]))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 8 }))
  .use(toolCalling);

await app.handler()(ctx);
```

## External docs

- [Web fetch](https://github.com/finger-gun/sisu/tree/main/packages/tools/web-fetch)
- [Web search](https://github.com/finger-gun/sisu/tree/main/packages/tools/web-search-google)
- [Terminal](https://github.com/finger-gun/sisu/tree/main/packages/tools/terminal)
- [All tools](https://github.com/finger-gun/sisu/tree/main/packages/tools)
