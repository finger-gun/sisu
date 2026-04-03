## Why

The CLI currently requires tool-specific hardcoded settings UX, which does not scale to community tools and leaves users with inconsistent configuration experiences. We need a schema-driven approach so the CLI can discover and render valid config options for any tool without bespoke code paths.
Separately, there is no first-class installation workflow for tools and middleware, leaving users effectively limited to pre-bundled capabilities even when official packages exist in `@sisu-ai`.

## What Changes

- Introduce a schema-driven tool configuration contract so tools can optionally publish config metadata the CLI can consume.
- Add generic CLI settings rendering for tool options based on schema types (booleans, numbers, arrays, enums) rather than tool-specific hardcoded menus.
- Unify validation so the same schema is used for both interactive settings and command-based config updates.
- Preserve backward compatibility for tools that do not provide schema metadata (fallback to JSON/manual configuration paths).
- Add reusable conventions for optional UI hints and presets that community tools can adopt.
- Add a first-class installation workflow for tools and middleware via CLI command and built-in skill, including project/global scope and `.sisu`-scoped dependency management.

### Goals

- Make tool settings discoverable and self-describing from tool-provided metadata.
- Keep custom tool authoring simple with progressive adoption (schema optional, not mandatory).
- Eliminate per-tool bespoke settings code for common config surfaces.
- Ensure setting a capability (e.g., write/delete) can be paired with compatible command allowlists in a predictable way.
- Make it straightforward for users and agents to install official `@sisu-ai` tools/middleware without manual npm wiring.

### Non-goals

- Rewriting all existing tools to full schema metadata in this change.
- Building a full GUI form engine beyond existing CLI interaction patterns.
- Changing core tool execution semantics unrelated to configuration discoverability.
- Replacing existing npm/package manager behavior outside the new install workflow.

## Capabilities

### New Capabilities
- `cli-schema-driven-tool-config`: Generic schema-based tool config discovery, validation, and interactive settings flow for CLI.
- `cli-capability-install-workflow`: Install tools and middleware from `@sisu-ai` packages using CLI command and built-in installer skill, with automatic registration wiring.

### Modified Capabilities
- None.

## Impact

- **Affected code**: `packages/cli/sisu/src/chat/*` settings/runtime/profile/install paths, capability metadata flow, and CLI command surfaces; optional metadata exports for tool packages.
- **User-facing changes**: Tool settings menus can show applicable options and accept structured edits without requiring raw JSON guessing; users can install tool/middleware packages with a single CLI/skill workflow.
- **API surface**: Adds an optional tool configuration metadata contract for tool authors (community-safe progressive enhancement) and a CLI install command surface for capabilities.
- **Dependencies/systems**: OpenSpec/CLI configuration flow, package installation in `.sisu` (project/global), and capability loader registration; no required breaking runtime changes for tools without schema metadata.
- **Target audience/use cases**:
  - CLI users configuring built-in tools safely from settings.
  - Community tool authors who want first-class settings UX with minimal additional metadata.
  - CLI users and agents that need to discover/install official tools and middleware without manual package management.
- **Success metrics / acceptance criteria**:
  - At least one built-in tool (terminal) configured through schema-driven UI with no hardcoded field list in runtime menus.
  - A custom tool can expose schema metadata and appear in settings with typed options without new CLI menu code.
  - Tools without schema metadata remain configurable through existing fallback pathways.
  - User can run `sisu install tool <name>` or `sisu install middleware <name>` (project/global) and have capability discoverable/configurable in CLI without manual `.sisu` wiring edits.
