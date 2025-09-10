# @sisu-ai/tool-web-search-openai

Web search tool powered by OpenAI's Responses API `web_search` capability.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Ftool-web-search-openai)](https://www.npmjs.com/package/@sisu-ai/tool-web-search-openai)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

Install
```bash
npm i @sisu-ai/tool-web-search-openai
```

Environment
- `OPENAI_API_KEY` or `API_KEY`: API key (required)
- `OPENAI_RESPONSES_BASE_URL`: Base URL for the Responses API. Defaults to `https://api.openai.com`.
- `OPENAI_BASE_URL` or `BASE_URL`: Fallback base URL if `OPENAI_RESPONSES_BASE_URL` is not set.
- `OPENAI_RESPONSES_MODEL`: Model to use (default `gpt-4.1-mini`). If missing, the tool will try to infer from the adapter (`openai:<model>`), then fall back to default.
- `DEBUG_LLM=1`: Logs a redacted request preview and response summary.

Usage
```ts
import { Agent } from '@sisu-ai/core';
import { registerTools } from '@sisu-ai/mw-register-tools';
import { toolCalling } from '@sisu-ai/mw-tool-calling';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { openAIWebSearch } from '@sisu-ai/tool-web-search-openai';

const model = openAIAdapter({ model: 'gpt-4o-mini' });
const app = new Agent()
  .use(registerTools([openAIWebSearch]))
  .use(toolCalling);
```

Notes
- If your main adapter uses a gateway (e.g., OpenRouter) that does not support `/v1/responses`, set `OPENAI_RESPONSES_BASE_URL=https://api.openai.com` so the tool hits the correct endpoint.
- On provider/tool mismatch, the tool retries once with a safe default model (`gpt-4.1-mini`).

# Community & Support

Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu. Example projects live under [`examples/`](https://github.com/finger-gun/sisu/tree/main/examples) in the repo.


- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)

