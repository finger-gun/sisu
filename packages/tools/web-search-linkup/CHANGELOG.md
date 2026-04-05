# @sisu-ai/tool-web-search-linkup

## 2.0.0

### Minor Changes

- 3e8c117: Add catalog-driven capability discovery and installation to the CLI, including improved interactive chat capabilities and configuration flows.

  Publish the new `@sisu-ai/discovery` and `@sisu-ai/tool-web-search-linkup` packages for dynamic package discovery and LinkUp web search support.

  Patch provider adapters and DuckDuckGo web search handling for improved runtime compatibility and safer error handling.

### Patch Changes

- Updated dependencies [aa659d9]
  - @sisu-ai/core@2.5.0

## 1.0.0

### Patch Changes

- Add LinkUp web search tool package for Sisu agents.

  This package introduces `linkupWebSearch`, a typed `webSearch` tool backed by `linkup-sdk`, including strict Zod validation, deterministic API key resolution from deps/env, and explicit provider error propagation.

- Updated dependencies
  - @sisu-ai/core@2.4.0
