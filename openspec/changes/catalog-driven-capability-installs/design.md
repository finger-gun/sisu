## Context

CLI capability installation currently composes three concerns in one path: package discovery, package installation, and post-install configuration. Discovery uses live `npm search`, which is non-deterministic and incomplete; installation is mostly single-package oriented; and higher-level capability stacks (notably RAG) require users to understand internal dependency wiring.

This change introduces a catalog-first install architecture and dependency-aware recipes so users can install individual capabilities or opinionated bundles with predictable outcomes. It touches multiple CLI modules (`runtime`, install engine, discovery, profile persistence) and introduces a generated discovery package (`@sisu-ai/discovery`) that can be produced in framework repo and consumed by CLI even after repository split.

Stakeholders:
- End users installing official tools/middleware from settings.
- Advanced users customizing vector backend for RAG.
- Maintainers shipping official packages who need deterministic discovery and low-support install UX.

Constraints:
- Preserve current custom package install flexibility.
- Keep installs project/global scoped under existing `.sisu` roots.
- Keep runtime behavior explicit and reversible (no hidden side effects beyond declared recipe actions).
- Maintain backward compatibility for existing direct `/install` usage.

## Goals / Non-Goals

**Goals:**
- Provide deterministic official package listing from a shipped catalog.
- Support dependency-aware install recipes (single package and bundle installs).
- Provide “RAG Recommended” one-step setup (tool + middleware + default vector backend).
- Provide “RAG Advanced” guided backend selection and config wiring.
- Keep install flows explicit in settings, with clear scope handling and error reporting.

**Non-Goals:**
- Building a universal third-party dependency solver.
- Replacing manual JSON editing for all advanced scenarios.
- Auto-migrating arbitrary existing user configs to recipe schema without user action.
- Changing core execution semantics of tools/middleware outside setup flows.

## Decisions

### 1) Catalog-first discovery via `@sisu-ai/discovery`
Decision:
- Add a generated discovery package `@sisu-ai/discovery` that exports official package catalog + recipe metadata built from monorepo package metadata during release/build.
- CLI discovery depends on `@sisu-ai/discovery` as primary source for official tools/middleware/skills listings; optional live lookup remains fallback for debugging/development only.

Rationale:
- Deterministic and complete listings across environments.
- Removes `npm search` pagination/ranking variability.

Alternatives considered:
- Continue using `npm search --searchlimit N`: still incomplete/flaky and query-dependent.
- Query npm registry API at runtime: network variability/rate limits and extra complexity for no strong product gain.

Integration points:
- Discovery package generation/publish pipeline in framework repo.
- `packages/cli/sisu/src/chat/npm-discovery.ts` refactored to read catalog model.
- CLI package dependency on `@sisu-ai/discovery`.

### 2) Recipe schema for install orchestration
Decision:
- Introduce install recipe metadata schema inside catalog entries (or adjacent recipe file) with:
  - `id`, `label`, `kind` (`package` | `bundle`)
  - `installs[]`: ordered package installs (`type`, `name`, `scopeBehavior`)
  - `choices[]`: optional guided prompts (e.g., vector backend)
  - `postInstall[]`: declarative config actions (enable capability, set middleware pipeline entry, set tool/middleware config keys)

Rationale:
- Encodes required dependency and wiring logic explicitly.
- Reusable by both interactive settings and command-based install surfaces.

Alternatives considered:
- Hardcode RAG flow in runtime menus: fast short-term but not extensible.
- Imperative script hooks per package: flexible but opaque and harder to validate.

Error handling:
- Recipe execution is stepwise; failures surface exact step and package/action.
- Config-write steps use existing profile persistence helpers and should report target path.
- For partial installs, report completed steps and suggested cleanup/retry (no silent rollback unless supported by install engine path).

Cancellation behavior:
- Interactive prompts can cancel before execution.
- Mid-run cancellation returns with explicit status and no further steps executed.

### 3) Opinionated RAG flows with explicit advanced override
Decision:
- Add two guided install entries:
  - `rag-recommended`: installs `@sisu-ai/tool-rag`, `@sisu-ai/mw-rag`, `@sisu-ai/vector-vectra` and applies default middleware/tool wiring.
  - `rag-advanced`: same base but prompts backend choice (`vectra`, `chroma`, `custom`) and writes `vectorStore` config accordingly.

Rationale:
- Makes powerful capability accessible quickly while retaining expert control.

Alternatives considered:
- Only advanced mode: too much friction for first-time users.
- Only recommended mode: insufficient flexibility for production users.

### 4) Shared execution path between settings and command surfaces
Decision:
- Route menu-based installs and `/install` through a shared orchestration layer (install engine + recipe executor).
- Keep raw `/install <tool|middleware> <name>` semantics unchanged; recipe/bundle installs introduced as additive commands/menu actions.

Rationale:
- Avoids drift between UX paths.
- Keeps current scriptability/automation for existing users.

Public exports / API surface:
- Internal CLI exports may add recipe/catalog types.
- No expected breaking change to current public CLI command forms; additive new commands/menu entries only.

## Risks / Trade-offs

- [Catalog drift from published npm state] → Generate discovery package in release workflow from source-of-truth monorepo package graph; add CI check for consistency.
- [Recipe complexity growth] → Keep schema declarative and versioned; validate recipes at load time with strict errors.
- [Partial install states on failure] → Provide explicit step-by-step failure output, track completed actions, and add follow-up remediation guidance.
- [RAG default backend may not fit all users] → Offer advanced backend selector in same guided flow and keep manual override paths.
- [Future capability relationships may exceed current schema] → Add schema versioning and backward-compatible parser.

## Migration Plan

1. Add catalog/recipe schema and generation script in new `@sisu-ai/discovery` package from monorepo package metadata.
2. Publish `@sisu-ai/discovery` and consume it from CLI discovery layer.
3. Extend install engine with recipe execution and structured step reporting.
4. Update settings install UX:
   - top-level tools/middleware install entry
   - official catalog list + custom package fallback
   - recipe entries (including RAG recommended/advanced)
5. Add additive command entry for recipe install (if needed) while preserving existing `/install`.
6. Add tests (catalog loading, recipe execution success/failure, RAG recommended/advanced wiring).
7. Rollout guarded by feature flag if needed; fallback to current direct package install path for break-glass.

Rollback:
- Disable catalog/recipe mode and revert to existing direct install path.
- Keep custom package install available throughout transition.

## Open Questions

- Should recipe install be exposed as explicit command (`/install-recipe <id>`) or integrated into `/install` argument parsing?
- Should discovery package include semantic compatibility constraints (CLI version ranges, platform constraints) in v1?
- For `rag-advanced`, do we allow direct custom constructor/config payload in flow, or keep to package/backend selection only in v1?
- Should partial install rollback be transactional in v1, or documented as best-effort with remediation output?
