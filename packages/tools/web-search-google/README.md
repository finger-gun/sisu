# @sisu-ai/tool-web-search-google

Google Programmable Search (Custom Search) powered web search tool.

Note: This tool queries Google’s JSON API (Programmable Search Engine). You need an API key and a search engine ID (CX).

## Install
```bash
npm i @sisu-ai/tool-web-search-google
```

## Environment
- `GOOGLE_CSE_API_KEY`: Google API key (required)
- `GOOGLE_CSE_CX`: Programmable Search Engine ID (required)

## Usage
```ts
import { Agent } from '@sisu-ai/core';
import { registerTools } from '@sisu-ai/mw-register-tools';
import { toolCalling } from '@sisu-ai/mw-tool-calling';
import { googleWebSearch } from '@sisu-ai/tool-web-search-google';

const app = new Agent()
  .use(registerTools([googleWebSearch]))
  .use(toolCalling);
```

## Returns
- An array of results like `{ title, link, snippet }` from the Custom Search API.

## Tips
- Consider rate limits and quotas on Google’s API.
- Use alongside `@sisu-ai/tool-web-fetch` to fetch and summarize selected results.

# Community & Support
- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
