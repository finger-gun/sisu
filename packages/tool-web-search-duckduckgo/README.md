# @sisu-ai/tool-web-search-duckduckgo

Simple web search tool using DuckDuckGo's Instant Answer API.

Install
```bash
npm i @sisu-ai/tool-web-search-duckduckgo
```

Environment
- No API key required.

Usage
```ts
import { Agent } from '@sisu-ai/core';
import { registerTools } from '@sisu-ai/mw-register-tools';
import { toolCalling } from '@sisu-ai/mw-tool-calling';
import { duckDuckGoWebSearch } from '@sisu-ai/tool-web-search-duckduckgo';

const app = new Agent()
  .use(registerTools([duckDuckGoWebSearch]))
  .use(toolCalling);
```

Returns
- An array of up to 5 `{ title, url }` results derived from related topics.

Notes
- The Instant Answer API is rate-limited and designed for lightweight use.

