---
"@sisu-ai/adapter-anthropic": patch
"@sisu-ai/adapter-ollama": patch
"@sisu-ai/adapter-openai": patch
"@sisu-ai/core": patch
"@sisu-ai/mw-agent-run-api": patch
"@sisu-ai/mw-context-compressor": patch
"@sisu-ai/mw-control-flow": patch
"@sisu-ai/mw-conversation-buffer": patch
"@sisu-ai/mw-cors": patch
"@sisu-ai/mw-error-boundary": patch
"@sisu-ai/mw-guardrails": patch
"@sisu-ai/mw-invariants": patch
"@sisu-ai/mw-rag": patch
"@sisu-ai/mw-react-parser": patch
"@sisu-ai/mw-register-tools": patch
"@sisu-ai/mw-tool-calling": patch
"@sisu-ai/mw-trace-viewer": patch
"@sisu-ai/mw-usage-tracker": patch
"@sisu-ai/server": patch
"@sisu-ai/tool-aws-s3": patch
"@sisu-ai/tool-azure-blob": patch
"@sisu-ai/tool-extract-urls": patch
"@sisu-ai/tool-github-projects": patch
"@sisu-ai/tool-summarize-text": patch
"@sisu-ai/tool-terminal": patch
"@sisu-ai/tool-vec-chroma": patch
"@sisu-ai/tool-web-fetch": patch
"@sisu-ai/tool-web-search-duckduckgo": patch
"@sisu-ai/tool-web-search-openai": patch
"@sisu-ai/tool-wikipedia": patch
"@sisu-ai/vector-core": patch
---

Add CodeQL badges to documentation for enhanced security scanning
- Added CodeQL badge to the main README.md for visibility.
- Included CodeQL badge in the README.md files of various packages:
  - adapters: anthropic, ollama, openai
  - middleware: agent-run-api, context-compressor, control-flow, conversation-buffer, error-boundary, guardrails, invariants, rag, react-parser, register-tools, tool-calling, trace-viewer, usage-tracker
  - server
  - tools: aws-s3, azure-blob, extract-urls, github-projects, summarize-text, terminal, vec-chroma, web-fetch, web-search-duckduckgo, web-search-google, web-search-openai, wikipedia
  - vector: core
