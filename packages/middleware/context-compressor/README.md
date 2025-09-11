# @sisu-ai/mw-context-compressor

Middleware that compresses long conversation context using the model itself.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![CodeQL](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fmw-context-compressor)](https://www.npmjs.com/package/@sisu-ai/mw-context-compressor)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

- Wraps `ctx.model.generate` to summarize older messages when the context grows beyond a size threshold.
- Preserves the last `keepRecent` messages unmodified.
- Keeps essential facts and URLs; emits a compact assistant summary message that replaces older history.

## Usage
```ts
import { contextCompressor } from '@sisu-ai/mw-context-compressor';

agent.use(contextCompressor({ maxChars: 200_000, keepRecent: 8, summaryMaxChars: 12_000 }));
```

## Options
- `maxChars` (default 200k): approximate character budget before compressing.
- `keepRecent` (default 8): number of most recent messages to retain verbatim.
- `summaryMaxChars` (default 12k): target maximum size of the generated summary message.

Note: This is a best-effort char-based heuristic; exact token accounting varies by model.


# Community & Support

Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu. Example projects live under [`examples/`](https://github.com/finger-gun/sisu/tree/main/examples) in the repo.

- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)