# @sisu-ai/adapter-anthropic

## 10.0.0

### Patch Changes

- Updated dependencies [3f417c7]
  - @sisu-ai/core@2.6.0

## 9.0.0

### Patch Changes

- 3e8c117: Add catalog-driven capability discovery and installation to the CLI, including improved interactive chat capabilities and configuration flows.

  Publish the new `@sisu-ai/discovery` and `@sisu-ai/tool-web-search-linkup` packages for dynamic package discovery and LinkUp web search support.

  Patch provider adapters and DuckDuckGo web search handling for improved runtime compatibility and safer error handling.

- Updated dependencies [aa659d9]
  - @sisu-ai/core@2.5.0

## 8.1.2

### Patch Changes

- Fix a startup crash in global/`npx` CLI installs caused by adapter imports expecting a newer `@sisu-ai/core` embedding export.

  Adapters now resolve `createEmbeddingsClient` compatibly at runtime and fall back to an internal embeddings client implementation when needed, preventing ESM import-time failures with older published core artifacts.

  CLI gets a patch bump so published dependency versions pull in the fixed adapter releases.

## 8.1.1

### Patch Changes

- 9f6ab75: Improve adapter reliability by migrating provider transport internals to official SDK clients while preserving existing Sisu adapter APIs.

  This update includes better request/response normalization consistency, stronger streaming and tool-calling conformance coverage, improved cancellation handling, and updated adapter migration notes.

## 8.1.0

### Minor Changes

- c5171a1: Add vision input support to the Anthropic adapter.

  You can now send mixed text + image user messages using content parts and convenience image fields (`content`/`contentParts`, `image_url`, `image`, `images`, `image_urls`). The adapter normalizes image inputs (data URLs, base64, and remote URLs) into Anthropic-compatible image blocks while preserving existing tool-calling and text-only behavior.

  This is an additive feature with no required migration changes.

## 8.0.0

### Patch Changes

- Updated dependencies
  - @sisu-ai/core@2.4.0

## 7.0.3

### Patch Changes

- Polish package README intros for better npm discoverability and SEO.

  This release updates package documentation openings to be clearer and more benefit-focused, improving first impression and package listing snippets on npm.

- Updated dependencies
  - @sisu-ai/core@2.3.3

## 7.0.2

### Patch Changes

- Patch release across all published `@sisu-ai/*` packages.

  This release increments patch versions for the full package set to publish the latest internal improvements and documentation updates.

- Updated dependencies
  - @sisu-ai/core@2.3.2

## 7.0.1

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

- Updated dependencies
  - @sisu-ai/core@2.3.1

## 7.0.0

### Patch Changes

- chore: Update peer dependencies to use caret ranges

  Changed all peer dependencies from exact versions to caret ranges (e.g., `"2.2.1"` → `"^2.2.1"`).

  **Benefits:**
  - Prevents unnecessary major version bumps when core package receives minor/patch updates
  - Follows semantic versioning best practices
  - Aligns with standard npm ecosystem conventions
  - Reduces version number inflation across the monorepo

  **Technical Details:**
  - `^2.2.1` accepts any version ≥2.2.1 and <3.0.0 (backwards compatible updates)
  - Only breaking changes (major version bumps) will now trigger major bumps in dependent packages
  - No runtime behavior changes - this is purely a metadata update

  This is a non-breaking change that improves the maintainability of the monorepo.

- Updated dependencies
  - @sisu-ai/core@2.3.0

## 6.0.1

### Patch Changes

- Updated dependencies
  - @sisu-ai/core@2.2.1

## 6.0.0

### Patch Changes

- Updated dependencies [7f0e07e]
  - @sisu-ai/core@2.2.0

## 5.0.0

### Patch Changes

- Updated dependencies [4c5a27a]
  - @sisu-ai/core@2.1.0

## 4.0.1

### Patch Changes

- Updated dependencies [bacf245]
  - @sisu-ai/core@2.0.1

## 4.0.0

### Patch Changes

- Updated dependencies [de89201]
  - @sisu-ai/core@2.0.0

## 3.0.0

### Patch Changes

- Updated dependencies [e9f7d6c]
  - @sisu-ai/core@1.2.0

## 2.0.3

### Patch Changes

- Updated dependencies
  - @sisu-ai/core@1.1.3

## 2.0.2

### Patch Changes

- Updated dependencies [0e36092]
  - @sisu-ai/core@1.1.2

## 2.0.1

### Patch Changes

- 82e8b95: Add CodeQL badges to documentation for enhanced security scanning
  - Added CodeQL badge to the main README.md for visibility.
  - Included CodeQL badge in the README.md files of various packages:
    - adapters: anthropic, ollama, openai
    - middleware: agent-run-api, context-compressor, control-flow, conversation-buffer, error-boundary, guardrails, invariants, rag, react-parser, register-tools, tool-calling, trace-viewer, usage-tracker
    - server
    - tools: aws-s3, azure-blob, extract-urls, github-projects, summarize-text, terminal, vec-chroma, web-fetch, web-search-duckduckgo, web-search-google, web-search-openai, wikipedia
    - vector: core
- Updated dependencies [82e8b95]
  - @sisu-ai/core@1.1.1

## 2.0.0

### Patch Changes

- Updated dependencies [b2675b7]
  - @sisu-ai/core@1.1.0

## 1.1.0

### Minor Changes

- 03b0e75: refactor: streamline example commands in package.json and enhance README documentation across adapters
  - Updated example commands in package.json to remove unnecessary trace styles for clarity.
  - Enhanced README files for @sisu-ai/adapter-anthropic, @sisu-ai/adapter-ollama, and @sisu-ai/adapter-openai with improved descriptions and community support information.
  - Improved core README to clarify functionality and provide a minimal example with better logging practices.

## 1.0.2

### Patch Changes

- 2b3af8b: Documentation updates
- Updated dependencies [2b3af8b]
  - @sisu-ai/core@1.0.2

## 1.0.1

### Patch Changes

- 94c8fd1: Add keywords to package metadata.
- Updated dependencies [94c8fd1]
  - @sisu-ai/core@1.0.1

## 1.0.0

### Major Changes

- 8a5a90e: Anthropic Messages API adapter with tool calling and streaming.

### Patch Changes

- Updated dependencies [8a5a90e]
  - @sisu-ai/core@1.0.0
