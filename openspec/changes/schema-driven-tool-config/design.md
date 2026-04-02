## Context

The current CLI tool configuration flow evolved from one-off additions for the terminal tool. This created drift between what tools support and what the settings UI can render, and it does not provide a clear path for community tools to expose typed configuration in settings without core CLI changes.

The proposal introduces a schema-driven contract so tool authors can publish optional config metadata and the CLI can render and validate tool settings generically. This change targets both built-in and community tools, while preserving compatibility for tools that do not adopt metadata.
In parallel, the proposal adds a first-class install workflow for tools and middleware so users are not limited to pre-bundled capabilities.

## Goals / Non-Goals

**Goals:**
- Define a single, reusable tool config metadata contract (schema + defaults + optional UI hints/presets).
- Wire capability/tool registry to carry metadata from tools into CLI runtime.
- Implement generic settings rendering based on schema field types rather than tool-specific hardcoded fields.
- Reuse the same metadata for validation in both interactive settings and command-driven updates.
- Keep tool creation easy: metadata is optional, and tools without metadata still work.
- Add a built-in install workflow (CLI command + install skill) for `@sisu-ai` tools/middleware with project/global scope.

**Non-Goals:**
- Migrating every existing tool in this same change.
- Introducing a new external GUI framework or non-CLI settings experience.
- Replacing all existing profile persistence semantics.
- Replacing external package manager behavior beyond invoking it from controlled CLI workflows.

## Decisions

### 1) Introduce optional tool config metadata as a first-class contract
- **Decision**: Add optional exports for tool configuration metadata (e.g., schema/defaults/presets/hints), leaving existing tool runtime APIs intact.
- **Rationale**: TypeScript interfaces alone are not available at runtime. A runtime schema contract is required for discoverable, generic UI and validation.
- **Alternatives considered**:
  - Parse TypeScript AST from packages at runtime: brittle, expensive, and poor for distributed/community tools.
  - Keep hardcoding per-tool UX in CLI: does not scale and fragments behavior.

### 2) Keep progressive adoption with backward compatibility
- **Decision**: Tools without metadata continue functioning; CLI falls back to manual JSON config paths.
- **Rationale**: Low-friction community adoption and no forced breaking changes.
- **Alternatives considered**:
  - Require metadata for all tools immediately: high migration burden and contributor friction.

### 3) Use schema-driven generic field rendering in CLI
- **Decision**: Render controls by field type (boolean toggle, number input, string-array editor, enum selector) with optional metadata hints.
- **Rationale**: One implementation supports many tools and removes custom per-tool menu code.
- **Alternatives considered**:
  - Ship preset-only UX: too restrictive (cannot set commands.allow, allowPipe, allowSequence, etc.).
  - Keep JSON-only entry: discoverability and usability remain poor.

### 4) Centralize validation on schema, not bespoke runtime conditionals
- **Decision**: Route all tool-config writes through schema validation before persistence/application.
- **Rationale**: Ensures consistent behavior for settings UI, slash commands, and config file edits.
- **Alternatives considered**:
  - Validate separately in each UX entrypoint: duplicates logic and creates divergence risks.

### 5) Registry-driven discovery for community tools
- **Decision**: Extend capability registry entries to include optional config metadata pointers and surface this in runtime listing/details APIs.
- **Rationale**: Community tools become discoverable/configurable with no CLI patch once metadata is exported.

### 6) Introduce a CLI-native capability installer
- **Decision**: Add `sisu install <tool|middleware> <name>` and a built-in installer skill that delegates to the same install engine.
- **Rationale**: Enables both direct user command and agent-driven installation using one consistent path and validation model.
- **Alternatives considered**:
  - Skill-only installer: excludes users operating outside agent flow.
  - Command-only installer: misses agent autonomy use case.

### 7) Scope package installation under `.sisu` with explicit project/global target
- **Decision**: Install capability packages into `.sisu` scoped dependency roots (`project/.sisu` or `~/.sisu`) and register those roots in loader config.
- **Rationale**: Keeps capability dependencies isolated from app dependencies, reduces lockfile noise, and aligns with existing `.sisu` model.
- **Alternatives considered**:
  - Install into project root `node_modules`: pollutes app dependency graph and may conflict with app tooling.
  - Global npm install: weaker portability and less deterministic project behavior.

### 8) Restrict installer source to `@sisu-ai` namespace in v1
- **Decision**: v1 install workflow supports official namespace packages only.
- **Rationale**: Reduces supply-chain risk and simplifies trust model for initial rollout.
- **Alternatives considered**:
  - Allow arbitrary packages immediately: stronger flexibility but larger trust and validation surface.

## Risks / Trade-offs

- **[Risk] Metadata shape churn could destabilize community tooling** → **Mitigation**: version the metadata contract and keep it additive.
- **[Risk] Schema too expressive for current CLI controls** → **Mitigation**: support a well-defined subset first; fallback to JSON editor for unsupported shapes.
- **[Risk] Inconsistent defaults between tool runtime and metadata** → **Mitigation**: require metadata defaults to derive from tool defaults and add conformance tests.
- **[Risk] Profile merge complexity with nested tool configs** → **Mitigation**: explicit deep-merge semantics per tool config key with test coverage.
- **[Risk] UX regression for existing flows** → **Mitigation**: keep existing commands, add new discoverability commands, and expand coverage tests.
- **[Risk] Installer could leave partial state on failure** → **Mitigation**: transactional update pattern (install first, then write config), clear rollback/error messaging.
- **[Risk] Project/global root confusion** → **Mitigation**: explicit scope flag/prompt and deterministic default behavior.
- **[Risk] Package trust/security concerns** → **Mitigation**: constrain initial source to `@sisu-ai`, validate package naming patterns, and log installed package provenance.

## Migration Plan

1. Add tool config metadata contract and registry plumbing in CLI/runtime.
2. Implement generic schema-based renderer in settings for tools with metadata.
3. Keep manual JSON command path as fallback (`/tool-config`) and add schema discovery command.
4. Migrate terminal tool metadata to the new contract as the reference implementation.
5. Add tests for:
   - metadata discovery
   - generic field rendering behavior
   - schema validation on write
   - fallback behavior for tools without metadata
6. Add installer engine and CLI command for tool/middleware install with project/global scope.
7. Add built-in installer skill that calls the same engine/command path for agent-driven installs.
8. Add capability loader root wiring updates after install and verify discoverability in runtime.
9. Rollout incrementally; no mandatory migration for community tools.
10. Rollback strategy: disable installer command/skill path and generic renderer path while preserving manual configuration and pre-existing capabilities.

## Open Questions

- Should the metadata contract use JSON Schema directly, Zod-derived JSON Schema, or a minimal custom schema subset?
- Do we want explicit per-field “danger level”/confirmation metadata in v1?
- Should presets be part of core contract or optional extension namespace?
- How should nested arrays/objects beyond basic scalar and string-array types be represented in v1 UI?
- Should v1 installer support uninstall/update commands or remain install-only in this change?
- Should non-`@sisu-ai` package sources be considered in a later guarded phase?
