# Summarize Text Tool

A utility tool that asks the active model to summarize large text bodies into concise outputs. Designed for use alongside `webFetch` or other content tools.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Ftool-summarize-text)](https://www.npmjs.com/package/@sisu-ai/tool-summarize-text)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

## Tool
- `summarizeText` — Summarize a given `text` with optional controls for length and style.

## Args
- `text` (string, required): The input to summarize.
- `target` ("short"|"medium"|"long", optional): Coarse target length. Default `medium`.
- `maxChars` (number, optional): Hard cap for output characters.
- `bullets` (boolean, optional): Prefer bullet-point output.
- `includeCitations` (boolean, optional): Keep/collect URLs in the summary when present.
- `focus` (string, optional): Guidance on what to emphasize.

## Notes
- Uses `ctx.model.generate` internally with `toolChoice:'none'` to avoid nested tool calls.
- For very long inputs, applies a simple map-reduce (chunk→summary→combine) approach.

# Community & Support

Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu. Example projects live under [`examples/`](https://github.com/finger-gun/sisu/tree/main/examples) in the repo.


- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
