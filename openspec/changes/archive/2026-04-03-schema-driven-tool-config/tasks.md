## 1. Metadata Contract and Registry Plumbing

- [x] 1.1 Define a reusable tool config metadata contract (schema/defaults/optional UI hints) in CLI or shared package with strict TypeScript types.
- [x] 1.2 Extend capability/tool registry models (`packages/cli/sisu/src/chat/capabilities.ts`) to carry optional config metadata references.
- [x] 1.3 Add runtime discovery/loading path so tool metadata is available at settings/render time without hardcoded tool branches.

## 2. Schema-Driven Validation and Persistence

- [x] 2.1 Replace bespoke per-tool validation with schema-driven validation entrypoints for tool config updates in runtime/profile paths.
- [x] 2.2 Ensure profile merge behavior deep-merges tool config per tool and per nested key while preserving existing backward compatibility.
- [x] 2.3 Keep fallback behavior for tools without metadata (manual JSON configuration still works and produces clear guidance).

## 3. Generic CLI Settings Rendering

- [x] 3.1 Implement generic tool settings renderer in CLI menus for supported schema field types (boolean, integer/number, string array, enum).
- [x] 3.2 Remove terminal-specific hardcoded settings controls in runtime menu code and route terminal through generic renderer.
- [x] 3.3 Add discoverability command output (e.g., `/tool-config-options <tool-id>`) generated from metadata instead of hardcoded option lists.

## 4. Terminal Reference Metadata Migration

- [x] 4.1 Add terminal tool metadata export (schema/defaults/hints/presets) aligned with runtime behavior and command policy constraints.
- [x] 4.2 Ensure permission-related presets include compatible command allowlists and operator flags (`allowPipe`, `allowSequence`) where applicable.
- [x] 4.3 Verify terminal runtime config application remains behavior-safe after metadata-driven path migration.

## 5. Community Tool Author Experience

- [x] 5.1 Document progressive adoption for custom/community tools (minimal tool API unchanged; metadata optional for richer settings UX).
- [x] 5.2 Add a concise authoring example showing how a custom tool exposes metadata and appears automatically in settings.
- [x] 5.3 Define compatibility/versioning guidance for metadata contract evolution.

## 6. Verification and Quality

- [x] 6.1 Add/extend tests in `packages/cli/sisu/test/*` for metadata discovery, generic settings rendering, validation errors, and fallback flows.
- [x] 6.2 Add/extend tests for terminal metadata consistency with effective runtime policy (especially commands.allow and operator toggles).
- [x] 6.3 Run `pnpm --filter @sisu-ai/cli lint`, `pnpm --filter @sisu-ai/cli typecheck`, `pnpm --filter @sisu-ai/cli test`, and `pnpm test`; fix regressions before completion.

## 7. Capability Install Engine and CLI Command

- [x] 7.1 Implement install engine in CLI that supports `tool` and `middleware` targets, validates official package naming, and resolves full package IDs under `@sisu-ai`.
- [x] 7.2 Add `sisu install <tool|middleware> <name>` command with explicit `project|global` scope and deterministic defaults.
- [x] 7.3 Install packages into `.sisu` scoped dependency roots (`project/.sisu` or `~/.sisu`) and update capability loader registration roots atomically.

## 8. Built-in Installer Skill Integration

- [x] 8.1 Create/ship a built-in installer skill with CLI that can install tools/middleware through the same install engine.
- [x] 8.2 Ensure agent path and direct CLI command path share validation, error handling, and success output contracts.
- [x] 8.3 Add user-facing guidance/help text for invoking installer skill and equivalent direct command usage.

## 9. Installer Verification and Safety

- [x] 9.1 Add tests for successful install flows (tool + middleware, project + global scope) and post-install discoverability in capability listings.
- [x] 9.2 Add tests for invalid input/source rejection and install-failure rollback/no-partial-config behavior.
- [x] 9.3 Run full verification (`pnpm --filter @sisu-ai/cli lint`, `pnpm --filter @sisu-ai/cli typecheck`, `pnpm --filter @sisu-ai/cli test`, `pnpm test`) after installer integration.
