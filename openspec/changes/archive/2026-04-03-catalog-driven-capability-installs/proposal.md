## Why

Official capability discovery in CLI settings currently depends on `npm search`, which is incomplete and inconsistent across environments. Users also lack a reliable install path for composite capabilities (for example RAG), where tools, middleware, and vector backends must be wired together correctly.

## What Changes

- Introduce a deterministic official capability catalog package (`@sisu-ai/discovery`) generated from this monorepo’s package inventory, so CLI can consume stable metadata without coupling discovery logic to the CLI repository.
- Add capability install recipe metadata so a package can declare dependent packages, optional backends, and post-install setup steps.
- Add an opinionated “RAG (Recommended)” install path that installs and wires:
  - `@sisu-ai/tool-rag`
  - `@sisu-ai/mw-rag`
  - `@sisu-ai/vector-vectra` (default backend)
- Add an “RAG (Advanced)” path allowing users to choose vector backend (`vectra`, `chroma`, or custom package) and configure `vectorStore` integration without manual JSON spelunking.
- Keep custom package-name install entry for power users and community packages not yet in catalog.
- Move install UX to top-level capability setup surfaces (tools/middleware), not tool-specific config menus.

### User-facing changes

- Settings menus show stable, deterministic official package lists.
- Users can install RAG as a pre-wired stack in one flow.
- Advanced users can override vector backend choices during install.

### API surface changes

- New internal catalog/recipe schema consumed by CLI install flows.
- No breaking public runtime API changes expected for existing tool/middleware authoring.

## Goals

- Deterministic official package listings in CLI.
- First-class install experience for dependency-aware capabilities.
- Fast onboarding path for RAG with safe defaults.
- Preserve flexibility for advanced/custom setups.

## Non-goals

- Replacing manual JSON configuration for every advanced edge case.
- Introducing dynamic dependency resolution for arbitrary third-party ecosystems.
- Changing core middleware/tool execution semantics outside install/setup flows.

## Target Audience & Use Cases

- CLI users who want reliable discovery/install of official Sisu capabilities.
- New users who need “just make RAG work” in one guided action.
- Advanced users who want to choose backend vector providers and custom packages while staying inside guided setup.

## Success Metrics & Acceptance Criteria

- Official tool/middleware lists in settings are complete and consistent across machines/runs.
- Users can install and enable RAG end-to-end via recommended flow without manual dependency hunting.
- Advanced flow can switch vector backend and still produce working middleware config.
- Custom package install path remains available and functional.

## Capabilities

### New Capabilities
- `capability-install-catalog`: Deterministic official capability catalog distributed via `@sisu-ai/discovery` and used as primary listing source.
- `capability-install-recipes`: Dependency-aware install recipes for capability bundles and setup hooks.
- `rag-guided-install`: Guided RAG install experience with recommended and advanced backend selection modes.

### Modified Capabilities
- `cli-package-discovery`: Requirement changes from best-effort live npm search to discovery-package-first deterministic discovery.
- `middleware-rag`: Installation/setup requirements extended to support guided backend selection and default vector store wiring.

## Impact

- Affected areas:
  - `packages/cli/sisu/src/chat/runtime.ts` (settings/install UX flow)
  - `packages/cli/sisu/src/chat/npm-discovery.ts` (catalog-first discovery path)
  - `packages/cli/sisu/src/chat/capability-install.ts` (recipe-aware install execution)
  - Discovery package generation/publish workflow (new `@sisu-ai/discovery`)
- Testing:
  - Add/extend tests for deterministic listing, recipe dependency installs, and RAG recommended/advanced setup outcomes.
- Dependencies/systems:
  - Introduces discovery package generation/publish step tied to monorepo package metadata during release/build.
  - CLI depends on `@sisu-ai/discovery` for official catalog + recipe metadata.
