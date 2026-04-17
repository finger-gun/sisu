# @sisu-ai/discovery

## 0.2.1

### Patch Changes

- ad040f8: Refresh generated discovery metadata for catalog and install recipes.

  This publishes updated `src/generated/catalog.json` and `src/generated/recipes.json` so consumers get the latest package versions and capability definitions at runtime.

## 0.2.0

### Minor Changes

- 3e8c117: Add catalog-driven capability discovery and installation to the CLI, including improved interactive chat capabilities and configuration flows.

  Publish the new `@sisu-ai/discovery` and `@sisu-ai/tool-web-search-linkup` packages for dynamic package discovery and LinkUp web search support.

  Patch provider adapters and DuckDuckGo web search handling for improved runtime compatibility and safer error handling.
