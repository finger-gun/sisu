# @sisu-ai/tool-web-search-linkup

Search the web with LinkUp from Sisu agents using a typed `webSearch` tool.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![CodeQL](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Ftool-web-search-linkup)](https://www.npmjs.com/package/@sisu-ai/tool-web-search-linkup)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

Install
```bash
npm i @sisu-ai/tool-web-search-linkup
```

Environment
- `LINKUP_API_KEY`: LinkUp API key (preferred)
- `API_KEY`: fallback key if `LINKUP_API_KEY` is not set
- `LINKUP_BASE_URL`: optional LinkUp API base URL override

Usage
```ts
import { Agent } from "@sisu-ai/core";
import { registerTools } from "@sisu-ai/mw-register-tools";
import { toolCalling } from "@sisu-ai/mw-tool-calling";
import { linkupWebSearch } from "@sisu-ai/tool-web-search-linkup";

const app = new Agent()
  .use(registerTools([linkupWebSearch]))
  .use(toolCalling);
```

Example tool call
```ts
await linkupWebSearch.handler({
  query: "What is Microsoft's revenue and operating income for 2024?",
  depth: "standard",
  outputType: "searchResults",
  includeImages: false,
}, ctx);
```

Supported options
- `query` (required)
- `depth`: `standard` (default) or `deep`
- `outputType`: `searchResults` (default), `sourcedAnswer`, or `structured`
- `includeImages`
- `fromDate`, `toDate`
- `includeDomains`, `excludeDomains`
- `includeInlineCitations` (for `sourcedAnswer`)
- `includeSources` (for `structured`)
- `maxResults`
- `structuredOutputSchema` (required when `outputType=structured`)

# Community & Support

Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu. Example projects live under [`examples/`](https://github.com/finger-gun/sisu/tree/main/examples) in the repo.


- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)

---

## Contributing

We build Sisu in the open. Contributions welcome.

[Contributing Guide](CONTRIBUTING.md) · [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md) · [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md) · [Code of Conduct](CODE_OF_CONDUCT.md)

---

<div align="center">

**[Star on GitHub](https://github.com/finger-gun/sisu)** if Sisu helps you build better agents.

*Quiet, determined, relentlessly useful.*

[Apache 2.0 License](LICENSE)

</div>
