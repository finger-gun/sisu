# Working Examples

The Sisu repository includes 25+ working examples demonstrating different capabilities.

All examples are located at: [github.com/finger-gun/sisu/tree/main/examples](https://github.com/finger-gun/sisu/tree/main/examples)

## Running examples

All examples support tracing and generate HTML trace files for debugging:

```bash
# Basic examples
pnpm ex:openai:hello        # Simple hello world
pnpm ex:anthropic:hello     # Anthropic version
pnpm ex:ollama:hello        # Local Ollama version

# Tool usage
pnpm ex:openai:weather      # Weather tool
pnpm ex:openai:web-search   # Web search
pnpm ex:openai:terminal     # Terminal commands
pnpm ex:openai:wikipedia    # Wikipedia search

# Advanced features
pnpm ex:openai:reasoning    # O1 reasoning models
pnpm ex:openai:react        # ReAct pattern
pnpm ex:openai:vision       # Image understanding
pnpm ex:openai:guardrails   # Safety guardrails

# Control flow
pnpm ex:openai:control-flow # Complex workflows
pnpm ex:openai:branch       # Conditional branching
pnpm ex:openai:parallel     # Parallel execution
pnpm ex:openai:graph        # DAG-based routing

# Streaming and servers
pnpm ex:openai:stream       # Streaming responses
pnpm ex:openai:server       # HTTP server

# RAG and vector
pnpm ex:openai:rag-chroma   # RAG with Chroma
pnpm ex:openai:rag-vectra   # RAG with Vectra

# Cloud storage
pnpm ex:openai:aws-s3       # AWS S3 operations
pnpm ex:openai:azure-blob   # Azure Blob storage

# Skills
pnpm ex:openai:skills       # Using filesystem skills
pnpm ex:anthropic:skills    # Anthropic + skills
```

## OpenAI examples

### Basic examples

- **[openai-hello](https://github.com/finger-gun/sisu/tree/main/examples/openai-hello)** - Minimal example
- **[openai-weather](https://github.com/finger-gun/sisu/tree/main/examples/openai-weather)** - Tool calling basics
- **[openai-stream](https://github.com/finger-gun/sisu/tree/main/examples/openai-stream)** - Token streaming
- **[openai-vision](https://github.com/finger-gun/sisu/tree/main/examples/openai-vision)** - Image understanding
- **[openai-reasoning](https://github.com/finger-gun/sisu/tree/main/examples/openai-reasoning)** - O1 reasoning models

### Control flow examples

- **[openai-control-flow](https://github.com/finger-gun/sisu/tree/main/examples/openai-control-flow)** - Sequential workflows
- **[openai-branch](https://github.com/finger-gun/sisu/tree/main/examples/openai-branch)** - Conditional branching
- **[openai-parallel](https://github.com/finger-gun/sisu/tree/main/examples/openai-parallel)** - Parallel execution
- **[openai-graph](https://github.com/finger-gun/sisu/tree/main/examples/openai-graph)** - DAG-based routing

### Advanced patterns

- **[openai-react](https://github.com/finger-gun/sisu/tree/main/examples/openai-react)** - ReAct (Reason + Act) pattern
- **[openai-guardrails](https://github.com/finger-gun/sisu/tree/main/examples/openai-guardrails)** - Safety constraints
- **[openai-error-handling](https://github.com/finger-gun/sisu/tree/main/examples/openai-error-handling)** - Error boundary usage

### Tools and integrations

- **[openai-web-search](https://github.com/finger-gun/sisu/tree/main/examples/openai-web-search)** - Web search integration
- **[openai-web-fetch](https://github.com/finger-gun/sisu/tree/main/examples/openai-web-fetch)** - Fetch URL contents
- **[openai-wikipedia](https://github.com/finger-gun/sisu/tree/main/examples/openai-wikipedia)** - Wikipedia search
- **[openai-terminal](https://github.com/finger-gun/sisu/tree/main/examples/openai-terminal)** - Execute shell commands
- **[openai-terminal-aliased](https://github.com/finger-gun/sisu/tree/main/examples/openai-terminal-aliased)** - Terminal with aliases
- **[openai-github-projects](https://github.com/finger-gun/sisu/tree/main/examples/openai-github-projects)** - GitHub API integration
- **[openai-extract-urls](https://github.com/finger-gun/sisu/tree/main/examples/openai-extract-urls)** - URL extraction

### RAG and vector

- **[openai-rag-chroma](https://github.com/finger-gun/sisu/tree/main/examples/openai-rag-chroma)** - RAG with Chroma vector DB
- **[openai-rag-vectra](https://github.com/finger-gun/sisu/tree/main/examples/openai-rag-vectra)** - RAG with local file-backed Vectra

### Cloud storage

- **[openai-aws-s3](https://github.com/finger-gun/sisu/tree/main/examples/openai-aws-s3)** - AWS S3 operations
- **[openai-azure-blob](https://github.com/finger-gun/sisu/tree/main/examples/openai-azure-blob)** - Azure Blob storage

### Server and streaming

- **[openai-server](https://github.com/finger-gun/sisu/tree/main/examples/openai-server)** - HTTP server implementation

### Skills

- **[openai-skills](https://github.com/finger-gun/sisu/tree/main/examples/openai-skills)** - Filesystem-based skills
- **[openai-agent-browser](https://github.com/finger-gun/sisu/tree/main/examples/openai-agent-browser)** - Browser automation

## Anthropic examples

- **[anthropic-hello](https://github.com/finger-gun/sisu/tree/main/examples/anthropic-hello)** - Basic Claude usage
- **[anthropic-weather](https://github.com/finger-gun/sisu/tree/main/examples/anthropic-weather)** - Tool calling with Claude
- **[anthropic-stream](https://github.com/finger-gun/sisu/tree/main/examples/anthropic-stream)** - Streaming responses
- **[anthropic-control-flow](https://github.com/finger-gun/sisu/tree/main/examples/anthropic-control-flow)** - Control flow patterns
- **[anthropic-skills](https://github.com/finger-gun/sisu/tree/main/examples/anthropic-skills)** - Skills with Claude

## Ollama examples

- **[ollama-hello](https://github.com/finger-gun/sisu/tree/main/examples/ollama-hello)** - Local LLM basics
- **[ollama-weather](https://github.com/finger-gun/sisu/tree/main/examples/ollama-weather)** - Tool calling locally
- **[ollama-stream](https://github.com/finger-gun/sisu/tree/main/examples/ollama-stream)** - Local streaming
- **[ollama-vision](https://github.com/finger-gun/sisu/tree/main/examples/ollama-vision)** - Image understanding locally
- **[ollama-web-search](https://github.com/finger-gun/sisu/tree/main/examples/ollama-web-search)** - Web search with local LLM

## Example structure

Each example typically includes:

```text
examples/openai-hello/
├── README.md           # Usage instructions
├── index.ts            # Main implementation
├── package.json        # Dependencies
├── .env.example        # Required environment variables
└── tsconfig.json       # TypeScript config
```

## Running examples from source

```bash
# Clone the repo
git clone https://github.com/finger-gun/sisu.git
cd sisu

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run an example
pnpm ex:openai:hello

# Or run with custom input
TRACE_HTML=1 pnpm run dev -w examples/openai-hello -- \
  --trace --trace-style=dark -- "Your custom prompt here"
```

## Environment variables

Most examples require API keys:

```bash
# OpenAI examples
OPENAI_API_KEY=sk-...

# Anthropic examples
ANTHROPIC_API_KEY=sk-ant-...

# Ollama examples (optional, uses local server)
OLLAMA_BASE_URL=http://localhost:11434

# Web search examples
GOOGLE_API_KEY=...
GOOGLE_SEARCH_ENGINE_ID=...

# Cloud storage examples
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AZURE_STORAGE_CONNECTION_STRING=...

# GitHub examples
GITHUB_TOKEN=...
```

## Trace viewer

All examples generate HTML trace files for debugging:

```bash
# Run with tracing enabled
TRACE_HTML=1 pnpm ex:openai:weather

# Open the trace file
open examples/openai-weather/traces/trace.html
```

Traces show:

- Token usage and costs
- Tool calls with timing
- Full conversation history
- Error details and stack traces
- Middleware execution order

## Learning path

Recommended order for learning:

1. **Start simple**
   - `openai-hello` - Basic agent
   - `openai-weather` - Tool calling
   - `openai-stream` - Streaming

2. **Add complexity**
   - `openai-control-flow` - Workflows
   - `openai-branch` - Conditional logic
   - `openai-react` - ReAct pattern

3. **Production features**
   - `openai-error-handling` - Error boundaries
   - `openai-guardrails` - Safety constraints
   - `openai-server` - HTTP API

4. **Advanced topics**
   - `openai-rag-chroma` - RAG with Chroma
   - `openai-rag-vectra` - RAG with Vectra
   - `openai-skills` - Filesystem skills
   - `openai-graph` - Complex routing

## Common example patterns

### Basic tool-calling agent

See: `openai-weather`, `anthropic-weather`, `ollama-weather`

```typescript
const app = new Agent()
  .use(errorBoundary())
  .use(traceViewer())
  .use(registerTools([weatherTool]))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 8 }))
  .use(toolCalling);
```

### Control flow agent

See: `openai-control-flow`, `openai-branch`, `openai-graph`

```typescript
const app = new Agent()
  .use(errorBoundary())
  .use(classify)
  .use(branch((ctx) => ctx.state.needsTools, toolPipeline, chatPipeline));
```

### Streaming agent

See: `openai-stream`, `anthropic-stream`, `ollama-stream`

```typescript
const app = new Agent().use(inputToMessage).use(async (ctx) => {
  const stream = await ctx.model.generate(ctx.messages, { stream: true });
  for await (const event of stream) {
    if (event.type === "token" && event.delta) {
      await ctx.stream.write(event.delta);
    }
  }
});
```

### RAG agent

See: `openai-rag-chroma`, `openai-rag-vectra`

```typescript
const app = new Agent()
  .use(errorBoundary())
  .use(
    rag({
      retrieval: (ctx) => vectorDB.search(ctx.input, 3),
      topK: 3,
    }),
  )
  .use(inputToMessage)
  .use(toolCalling);
```

## Tips for using examples

1. **Copy and modify** - Examples are templates, adapt them to your needs
2. **Enable tracing** - Always run with `TRACE_HTML=1` when learning
3. **Check README** - Each example has specific setup instructions
4. **Experiment** - Change prompts, tools, and middleware to understand behavior
5. **Compare adapters** - Try the same example with different LLM providers

## External resources

- **All examples**: [github.com/finger-gun/sisu/tree/main/examples](https://github.com/finger-gun/sisu/tree/main/examples)
- **Contributing examples**: [CONTRIBUTING.md](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
