# @sisu-ai/mw-register-tools

Register a set of tools at the start of the pipeline.

## Setup
```bash
npm i @sisu-ai/mw-register-tools
```

## Documentation
Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu

## API
- `registerTools(tools: Tool[])` — calls `ctx.tools.register(tool)` for each item.

## Usage
```ts
import { registerTools } from '@sisu-ai/mw-register-tools';

const app = new Agent()
  .use(registerTools([myTool]));
```
