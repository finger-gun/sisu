# @sisu-ai/adapter-ollama

Ollama Chat adapter with native tools support.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fadapter-ollama)](https://www.npmjs.com/package/@sisu-ai/adapter-ollama)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

## Setup
```bash
npm i @sisu-ai/adapter-ollama
```

- Start Ollama locally: `ollama serve`
- Pull a tools-capable model: `ollama pull llama3.1:latest`

## Documentation
Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu

## Usage
```ts
import { ollamaAdapter } from '@sisu-ai/adapter-ollama';

const model = ollamaAdapter({ model: 'llama3.1' });
// or with custom base URL: { baseUrl: 'http://localhost:11435' }

// Works with @sisu-ai/mw-tool-calling — tools are passed via GenerateOptions.tools
```

## Tools
- Accepts `GenerateOptions.tools` and sends them to Ollama under `tools`.
- Parses `message.tool_calls` into `{ id, name, arguments }` for the tool loop.
- Sends assistant `tool_calls` and `tool` messages back to Ollama for follow-up.

## Notes
- Tool choice forcing is model-dependent; current loop asks for tools on first turn and plain completion on second.
- Streaming can be added via Ollama's streaming API if desired.
 - Env: `OLLAMA_BASE_URL` or `BASE_URL` can override the base URL (or pass `baseUrl` in code). Examples may also support a CLI flag `--base-url` to override env.


# Community & Support

Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu. Example projects live under [`examples/`](https://github.com/finger-gun/sisu/tree/main/examples) in the repo.

- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
