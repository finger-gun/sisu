# @sisu-ai/mw-control-flow

Express branching, routing, loops, and graphs in agent pipelines with explicit middleware control flow.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![CodeQL](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fmw-control-flow)](https://www.npmjs.com/package/@sisu-ai/mw-control-flow)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

## Setup
```bash
npm i @sisu-ai/mw-control-flow
```

## Documentation
Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu

## API
- `sequence([a,b,c])`: Run middlewares in order as one unit. Good for composing small steps into a named phase.
- `branch(pred, onTrue, onFalse?)`: Classic if/else routing. Pred is `(ctx) => boolean`.
- `switchCase(select, routes, fallback?)`: Route by key `(ctx) => string` to a middleware from `routes`.
- `loopWhile(pred, body, { max })`: While-loop; evaluates `pred(ctx)` before each iteration.
- `loopUntil(done, body, { max })`: Do-while; runs `body` at least once until `done(ctx)` returns true.
- `parallel([a,b], merge?)`: Fork the same `ctx` through branches concurrently, then `merge(ctx, results)`.
- `graph(nodes, edges, start)`: Small DAG runner. Each node has an `id` and `run(ctx, next)`. `edges` decide traversal.

## Usage
```ts
import { sequence, branch, switchCase, loopUntil } from '@sisu-ai/mw-control-flow';

const decide = async (c, next) => { c.state.intent = c.input?.match(/tools/i) ? 'tool' : 'chat'; await next(); };
const toolFlow = sequence([/* tool loop */]);
const chatFlow = sequence([/* plain chat */]);

const app = new Agent()
  .use(decide)
  .use(switchCase(c => String(c.state.intent), { tool: toolFlow, chat: chatFlow }, chatFlow));
```

### Branch
Use `branch` when a boolean predicate cleanly splits flow.
```ts
import { branch, sequence } from '@sisu-ai/mw-control-flow';

const playful = sequence([/* witty system prompt + generate */]);
const practical = sequence([/* pragmatic system prompt + generate */]);

app.use(branch(c => /joke|humor/i.test(c.input ?? ''), playful, practical));
```

### switchCase
Route by an intent or mode string computed from context.
```ts
import { switchCase, sequence } from '@sisu-ai/mw-control-flow';

const classify = async (c, next) => { c.state.intent = /weather/.test(c.input ?? '') ? 'tool' : 'chat'; await next(); };
const toolPipeline = sequence([/* register tools, toolCalling, etc. */]);
const chatPipeline = sequence([/* plain completion */]);

app.use(classify).use(switchCase(c => c.state.intent, { tool: toolPipeline, chat: chatPipeline }, chatPipeline));
```

### loopUntil / loopWhile
Iterate a sub-pipeline while a condition holds (with a safety cap).
```ts
import { loopUntil, sequence } from '@sisu-ai/mw-control-flow';

const decideIfMore = async (c, next) => { c.state.more = c.messages.at(-1)?.role === 'tool'; await next(); };
const body = sequence([/* toolCalling */ decideIfMore]);
app.use(loopUntil(c => !c.state.more, body, { max: 6 }));
```

### graph
Encode multi-step flows as nodes + conditional edges (DAG). Good for “classify → handle → polish” shapes.
```ts
import { graph, type Node, type Edge } from '@sisu-ai/mw-control-flow';

const nodes: Node[] = [
  { id: 'classify', run: async (c, next) => { c.state.intent = pickIntent(c.input); await next(); } },
  { id: 'draft',    run: async (c) => {/* generate a plan */} },
  { id: 'chat',     run: async (c) => {/* simple completion */} },
  { id: 'polish',   run: async (c) => {/* refine output */} },
];
const edges: Edge[] = [
  { from: 'classify', to: 'draft', when: c => c.state.intent === 'draft' },
  { from: 'classify', to: 'chat',  when: c => c.state.intent !== 'draft' },
  { from: 'draft', to: 'polish' },
  { from: 'chat',  to: 'polish' },
];
app.use(graph(nodes, edges, 'classify'));
```

Notes
- Keep node bodies small and reuse regular middlewares inside `graph` nodes where possible.
- Prefer `switchCase`/`branch` for simple splits; reach for `graph` when you have 3+ phases or need to rejoin branches.


# Community & Support

Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu. Example projects live under [`examples/`](https://github.com/finger-gun/sisu/tree/main/examples) in the repo.

- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)

---

## Documentation

**Core** — [Package docs](packages/core/README.md) · [Error types](packages/core/ERROR_TYPES.md)

**Adapters** — [OpenAI](packages/adapters/openai/README.md) · [Anthropic](packages/adapters/anthropic/README.md) · [Ollama](packages/adapters/ollama/README.md)

<details>
<summary>All middleware packages</summary>

- [@sisu-ai/mw-agent-run-api](packages/middleware/agent-run-api/README.md)
- [@sisu-ai/mw-context-compressor](packages/middleware/context-compressor/README.md)
- [@sisu-ai/mw-control-flow](packages/middleware/control-flow/README.md)
- [@sisu-ai/mw-conversation-buffer](packages/middleware/conversation-buffer/README.md)
- [@sisu-ai/mw-cors](packages/middleware/cors/README.md)
- [@sisu-ai/mw-error-boundary](packages/middleware/error-boundary/README.md)
- [@sisu-ai/mw-guardrails](packages/middleware/guardrails/README.md)
- [@sisu-ai/mw-invariants](packages/middleware/invariants/README.md)
- [@sisu-ai/mw-orchestration](packages/middleware/orchestration/README.md)
- [@sisu-ai/mw-rag](packages/middleware/rag/README.md)
- [@sisu-ai/mw-react-parser](packages/middleware/react-parser/README.md)
- [@sisu-ai/mw-register-tools](packages/middleware/register-tools/README.md)
- [@sisu-ai/mw-tool-calling](packages/middleware/tool-calling/README.md)
- [@sisu-ai/mw-trace-viewer](packages/middleware/trace-viewer/README.md)
- [@sisu-ai/mw-usage-tracker](packages/middleware/usage-tracker/README.md)
</details>

<details>
<summary>All tool packages</summary>

- [@sisu-ai/tool-aws-s3](packages/tools/aws-s3/README.md)
- [@sisu-ai/tool-azure-blob](packages/tools/azure-blob/README.md)
- [@sisu-ai/tool-extract-urls](packages/tools/extract-urls/README.md)
- [@sisu-ai/tool-github-projects](packages/tools/github-projects/README.md)
- [@sisu-ai/tool-rag](packages/tools/rag/README.md)
- [@sisu-ai/tool-summarize-text](packages/tools/summarize-text/README.md)
- [@sisu-ai/tool-terminal](packages/tools/terminal/README.md)
- [@sisu-ai/tool-web-fetch](packages/tools/web-fetch/README.md)
- [@sisu-ai/tool-web-search-duckduckgo](packages/tools/web-search-duckduckgo/README.md)
- [@sisu-ai/tool-web-search-google](packages/tools/web-search-google/README.md)
- [@sisu-ai/tool-web-search-openai](packages/tools/web-search-openai/README.md)
- [@sisu-ai/tool-wikipedia](packages/tools/wikipedia/README.md)
</details>

<details>
<summary>All RAG packages</summary>

- [@sisu-ai/rag-core](packages/rag/core/README.md)
</details>

<details>
<summary>All vector packages</summary>

- [@sisu-ai/vector-core](packages/vector/core/README.md)
- [@sisu-ai/vector-chroma](packages/vector/chroma/README.md)
</details>

<details>
<summary>All examples</summary>

**Anthropic** — [hello](examples/anthropic-hello/README.md) · [control-flow](examples/anthropic-control-flow/README.md) · [stream](examples/anthropic-stream/README.md) · [weather](examples/anthropic-weather/README.md)

**Ollama** — [hello](examples/ollama-hello/README.md) · [stream](examples/ollama-stream/README.md) · [vision](examples/ollama-vision/README.md) · [weather](examples/ollama-weather/README.md) · [web-search](examples/ollama-web-search/README.md)

**OpenAI** — [hello](examples/openai-hello/README.md) · [weather](examples/openai-weather/README.md) · [stream](examples/openai-stream/README.md) · [vision](examples/openai-vision/README.md) · [reasoning](examples/openai-reasoning/README.md) · [react](examples/openai-react/README.md) · [control-flow](examples/openai-control-flow/README.md) · [branch](examples/openai-branch/README.md) · [parallel](examples/openai-parallel/README.md) · [graph](examples/openai-graph/README.md) · [orchestration](examples/openai-orchestration/README.md) · [orchestration-adaptive](examples/openai-orchestration-adaptive/README.md) · [guardrails](examples/openai-guardrails/README.md) · [error-handling](examples/openai-error-handling/README.md) · [rag-chroma](examples/openai-rag-chroma/README.md) · [web-search](examples/openai-web-search/README.md) · [web-fetch](examples/openai-web-fetch/README.md) · [wikipedia](examples/openai-wikipedia/README.md) · [terminal](examples/openai-terminal/README.md) · [github-projects](examples/openai-github-projects/README.md) · [server](examples/openai-server/README.md) · [aws-s3](examples/openai-aws-s3/README.md) · [azure-blob](examples/openai-azure-blob/README.md)
</details>

---

## Contributing

We build Sisu in the open. Contributions welcome.

[Contributing Guide](CONTRIBUTING.md) · [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md) · [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md) · [Code of Conduct](CODE_OF_CONDUCT.md)

---

<div align="center">

**[Star on GitHub](https://github.com/finger-gun/sisu)** if Sisu helps you build better agents.

*Quiet, determined, relentlessly useful.*

[Apache 2.0 License](LICENSE)

</div>
