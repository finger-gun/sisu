# @sisu-ai/mw-register-tools

Register a set of tools at the start of the pipeline.

## API
- `registerTools(tools: Tool[])` — calls `ctx.tools.register(tool)` for each item.

## Usage
```ts
import { registerTools } from '@sisu-ai/mw-register-tools';

const app = new Agent()
  .use(registerTools([myTool]));
```
