# @sisu-ai/tool-web-search-openai

Web search tool powered by OpenAI's Responses API `web_search` capability.

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

CLI flags (example app)
- `--openai-api-key`, `--api-key`
- `--openai-responses-base-url`, `--openai-base-url`, `--base-url`
- `--openai-responses-model`, `--openai-model`

Precedence
1) CLI flags (when provided by your app in `ctx.state.openai`, or read by core helpers)
2) Env vars
3) Adapter hints/metadata (e.g., `openAIAdapter({ responseModel })` or adapter model name)
4) Defaults

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
- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
