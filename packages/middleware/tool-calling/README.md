# @sisu-ai/mw-tool-calling
[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fmw-tool-calling)](https://www.npmjs.com/package/@sisu-ai/mw-tool-calling)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

Native tools API loop for providers that support tool calls.

## Setup
```bash
npm i @sisu-ai/mw-tool-calling
```

## Documentation
Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu

## Behavior
- `toolCalling`: single-round tool calling.
  - First turn: calls `ctx.model.generate(messages, { tools, toolChoice:'auto' })`.
  - If assistant returns `tool_calls`, appends the assistant message and executes each tool.
    - Executes each unique `(name, args)` once and responds to every `tool_call_id`.
    - Handles provider quirks by reusing last args for identical tool names with missing args.
  - Second turn: asks for a pure completion (`toolChoice:'none'`).
```mermaid
sequenceDiagram
  autonumber
  participant A as Agent toolCalling
  participant M as Model Adapter
  participant R as Tools Registry
  participant H as Tool Handler

  A->>R: list
  R-->>A: tools
  A->>M: generate with tools auto
  alt tool calls
    M-->>A: assistant with tool calls
    loop each unique name args
      A->>R: resolve and validate
      R-->>A: handler
      A->>H: execute
      H-->>A: append tool message
    end
    A->>M: generate finalize none
    M-->>A: assistant completion
  else no tool calls
    M-->>A: assistant completion
  end

```
- `iterativeToolCalling`: multi-round tool calling.
  - Repeats calls with `toolChoice:'auto'` until the model returns a message with no `tool_calls` (max 12 iters).

```mermaid
sequenceDiagram
  autonumber
  participant A as Agent iterativeToolCalling
  participant M as Model Adapter
  participant R as Tools Registry
  participant H as Tool Handler

  A->>R: list
  R-->>A: tools
  loop max twelve iterations until no tool calls
    A->>M: generate with tools auto
    alt tool calls present
      M-->>A: assistant with tool calls
      loop each unique name args
        A->>R: resolve and validate
        R-->>A: handler
        A->>H: execute
        H-->>A: append tool message
      end
    else no tool calls
      M-->>A: assistant no tools
    end
  end
  A->>M: generate finalize none
  M-->>A: assistant completion
```

## Usage
```ts
import { toolCalling, iterativeToolCalling } from '@sisu-ai/mw-tool-calling';

// Single-round
agent.use(toolCalling);

// OR multi-round
agent.use(iterativeToolCalling);
```

# Community & Support
- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
