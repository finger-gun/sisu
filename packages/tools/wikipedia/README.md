# @sisu-ai/tool-wikipedia

Wikipedia lookup tool using the REST API. Fetch a page summary, HTML, or related pages given an approximate title. The REST API performs redirects and normalization, so near-matches often resolve.

Install
```bash
npm i @sisu-ai/tool-wikipedia
```

Environment / Flags
- Language: `WIKIPEDIA_LANG` or `WIKI_LANG` (e.g., `en`, `sv`). CLI flags follow kebab-case, e.g., `--wikipedia-lang=sv`.
- Base URL override: `WIKIPEDIA_BASE_URL` or `WIKI_BASE_URL` (e.g., `https://en.wikipedia.org/api/rest_v1`). CLI flag `--wikipedia-base-url=...`.
- Defaults to `https://en.wikipedia.org/api/rest_v1`.

Usage
```ts
import { Agent } from '@sisu-ai/core';
import { registerTools } from '@sisu-ai/mw-register-tools';
import { toolCalling } from '@sisu-ai/mw-tool-calling';
import { wikipedia } from '@sisu-ai/tool-wikipedia';

const app = new Agent()
  .use(registerTools([wikipedia]))
  .use(toolCalling);
```

Tool
- Name: `wikipediaLookup`
- Args:
  - `title: string` — approximate page title
  - `format?: 'summary'|'html'|'related'` — default `summary`
  - `lang?: string` — language code; otherwise from env/flags

Returns
- `summary`: `{ type?, title, description?, extract?, url?, thumbnailUrl? }`
- `html`: `string` HTML
- `related`: `Array<{ title, description?, extract?, url?, thumbnailUrl? }>`

Notes
- For search-like behavior, consider calling `related` first and then fetching the best candidate's `summary`.

