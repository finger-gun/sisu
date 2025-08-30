# @sisu-ai/mw-tool-calling

Native tools API loop for providers that support tool calls.

## Setup
```bash
npm i @sisu-ai/mw-tool-calling
```

## Documentation
Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu

## Behavior
- First turn: calls `ctx.model.generate(messages, { tools, toolChoice:'auto' })`.
- If assistant returns `tool_calls`, appends the assistant message and executes each tool.
  - Executes each unique `(name, args)` once and responds to every `tool_call_id`.
  - Handles provider quirks (e.g., missing args on duplicates) by reusing last args.
- Second turn: asks for a pure completion (`toolChoice:'none'`).

## Usage
```ts
import { toolCalling } from '@sisu-ai/mw-tool-calling';

const app = new Agent()
  .use(toolCalling);
```
