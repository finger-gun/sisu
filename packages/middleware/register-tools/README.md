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

# Community & Support
- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
