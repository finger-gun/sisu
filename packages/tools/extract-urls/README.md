# @sisu-ai/tool-extract-urls

Extract unique `http`/`https` URLs from text snippets. Small, deterministic, and zero I/O — great as a first pass before fetching, classifying, or summarizing pages.

## Install
```bash
npm i @sisu-ai/tool-extract-urls
```

## Why it’s useful
- Simple guardrail: avoids asking the model to spot links.
- Deterministic: same inputs → same outputs.
- Lightweight: no network calls, safe to run early in a pipeline.

## Usage
```ts
import { Agent, SimpleTools } from '@sisu-ai/core';
import { registerTools } from '@sisu-ai/mw-register-tools';
import { toolCalling } from '@sisu-ai/mw-tool-calling';
import { extractUrlsTool } from '@sisu-ai/tool-extract-urls';

const app = new Agent()
  .use(registerTools([extractUrlsTool]))
  .use(toolCalling);

// Prompt example: "Find links in: https://example.com and http://sisu.ai"
```

## What it returns
- Array of unique URLs, e.g. `["https://example.com", "http://sisu.ai"]`.

## Notes
- The regex targets `http`/`https` URLs and ignores surrounding punctuation where possible.
- Prefer pairing with a fetch tool (e.g., `@sisu-ai/tool-web-fetch`) for subsequent content analysis.
