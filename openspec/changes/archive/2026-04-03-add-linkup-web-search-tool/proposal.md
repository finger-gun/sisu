## Why

Sisu includes web search tools for OpenAI and DuckDuckGo, but does not yet support LinkUp. Adding a LinkUp-native tool gives agent builders another high-quality search backend with sourced answers and raw result modes.

## What Changes

- Add a new package `@sisu-ai/tool-web-search-linkup` under `packages/tools/web-search-linkup`.
- Implement a typed `webSearch` tool backed by `linkup-sdk` with Zod validation.
- Add deterministic configuration for API key and options (ctx deps and env).
- Add unit tests covering success paths, argument normalization, and error handling.
- Add package docs/changelog and update repository documentation/catalog references.

### Goals

- Provide a production-usable LinkUp web search tool that works with existing Sisu tool-calling middleware.
- Keep behavior explicit and predictable with strict validation and clear failure messages.
- Match existing Sisu tool packaging and testing conventions.

### Non-goals

- Building a full LinkUp adapter package beyond the tool use-case.
- Adding a new example app in this change.
- Supporting x402 signer flows in v1 of this tool.

## Capabilities

### New Capabilities
- `linkup-web-search-tool`: Expose LinkUp search as a typed Sisu tool with validated options, deterministic config resolution, and explicit error reporting.

### Modified Capabilities
- None.

## Impact

- **Target audience**: Sisu developers who need current web search results and sourced answers in tool-calling agents.
- **Intended use cases**: research assistant flows, grounding responses with web sources, and custom retrieval pipelines.
- **User-facing changes**: a new installable tool package `@sisu-ai/tool-web-search-linkup`.
- **API surface changes**: new exported `linkupWebSearch` tool (default export included) and related argument/result types.
- **Affected systems**: `packages/tools/*`, discovery catalog generation output, and top-level docs tool listings.
- **Dependencies**: adds `linkup-sdk` runtime dependency.
- **Breaking changes**: none expected.

## Success Metrics

- Agents can register and execute the LinkUp tool in a standard `registerTools + toolCalling` pipeline.
- Missing or invalid configuration fails with explicit actionable errors.
- Core option set (`query`, `depth`, `outputType`, filters) is validated and passed correctly to LinkUp.
- New package passes lint/build/test with existing workspace quality gates.

## Acceptance Criteria

- OpenSpec design/spec/tasks are complete and apply-ready.
- `@sisu-ai/tool-web-search-linkup` compiles and exports the documented API.
- Unit tests cover configuration resolution, request mapping, and error scenarios.
- Repository docs and discovery catalog include the new package.
