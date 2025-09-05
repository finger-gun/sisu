# @sisu-ai/mw-register-tools
[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fmw-register-tools)](https://www.npmjs.com/package/@sisu-ai/mw-register-tools)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

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

# Community & Support
- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
