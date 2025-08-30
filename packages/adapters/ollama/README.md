# @sisu-ai/adapter-ollama

Ollama Chat adapter with native tools support.

## Setup
- Start Ollama locally: `ollama serve`
- Pull a tools-capable model: `ollama pull llama3.1:latest`

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
