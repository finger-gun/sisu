# @sisu-ai/tool-web-search-duckduckgo

Simple web search tool using DuckDuckGo's Instant Answer API.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Ftool-web-search-duckduckgo)](https://www.npmjs.com/package/@sisu-ai/tool-web-search-duckduckgo)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

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


# Community & Support

Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu. Example projects live under [`examples/`](https://github.com/finger-gun/sisu/tree/main/examples) in the repo.


- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
