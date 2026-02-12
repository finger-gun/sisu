# @sisu-ai/vector-core

## 1.0.5

### Patch Changes

- Infrastructure migration to pnpm + Turbo and tool aliasing support

  **Infrastructure Updates:**
  - Migrated from npm to pnpm for faster, more efficient dependency management
  - Added Turbo for optimized monorepo builds with caching
  - Updated all package dependencies and peer dependencies

  **New Feature:**
  - Added optional tool aliasing support in `registerTools` middleware - map SISU tool names to ecosystem-standard aliases (e.g., 'bash', 'read_file')

  **Example Usage:**

  ```typescript
  registerTools(terminal.tools, {
    aliases: {
      terminalRun: "bash",
      terminalReadFile: "read_file",
    },
  });
  ```

  **Maintenance:**
  - Code formatting standardization across packages
  - Internal improvements to tool-calling middleware

## 1.0.4

### Patch Changes

- 82e8b95: Add CodeQL badges to documentation for enhanced security scanning
  - Added CodeQL badge to the main README.md for visibility.
  - Included CodeQL badge in the README.md files of various packages:
    - adapters: anthropic, ollama, openai
    - middleware: agent-run-api, context-compressor, control-flow, conversation-buffer, error-boundary, guardrails, invariants, rag, react-parser, register-tools, tool-calling, trace-viewer, usage-tracker
    - server
    - tools: aws-s3, azure-blob, extract-urls, github-projects, summarize-text, terminal, vec-chroma, web-fetch, web-search-duckduckgo, web-search-google, web-search-openai, wikipedia
    - vector: core

## 1.0.3

### Patch Changes

- 03b0e75: docs: update README to include links to examples and documentation for better user guidance

## 1.0.2

### Patch Changes

- 2b3af8b: Documentation updates

## 1.0.1

### Patch Changes

- 94c8fd1: Add keywords to package metadata.

## 1.0.0

### Major Changes

- b3b2f00: Provider-agnostic vector types for Sisu. Keep adapters pluggable and portable.
