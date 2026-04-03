## Context

Sisu CLI chat currently resolves a profile and runs a mostly fixed runtime shape with limited capability toggles (primarily tool policy mode/allow/deny controls). The proposed change adds explicit, user-configurable activation for tools, skills, and middleware while keeping existing behavior as default for users who do not configure new fields.

The design must preserve current safety controls, deterministic startup validation, and layered configuration precedence (`~/.sisu/chat-profile.json` then `./.sisu/chat-profile.json`, with runtime/session overrides on top). It also must align with existing skills and middleware packages without introducing arbitrary runtime code loading.

Stakeholders are CLI-first users who want easier customization, teams that need project-local defaults, and maintainers who need a safe, testable extension model.

## Goals / Non-Goals

**Goals:**
- Provide a typed capability configuration model for tools, skills, and middleware in CLI chat profiles.
- Support interactive capability management in chat via command/menu UX.
- Support skill discovery from global and project directories and scripted installation workflows.
- Add middleware activation controls using a vetted middleware catalog and schema-validated options.
- Preserve deterministic startup and clear validation failures.

**Non-Goals:**
- Loading arbitrary third-party middleware code by path at runtime.
- Removing existing tool policy safety checks, confirmations, or deny rules.
- Introducing hosted skill distribution or remote registries in this change.

## Decisions

### 1) Introduce a unified capability registry in CLI runtime

The runtime will construct a single in-memory registry at startup with entries for tools, skills, and middleware. Each entry includes an ID, type, source, defaultEnabled flag, and optional typed config schema.

Rationale:
- Centralizes enable/disable semantics and conflict handling.
- Allows interactive UI to operate on one model.

Alternatives considered:
- Separate registries and command paths per capability type. Rejected because it duplicates precedence and validation logic.

### 2) Extend profile schema with optional capability sections

Profiles gain optional sections for `tools`, `skills`, and `middleware`:
- explicit `enabled` and `disabled` lists
- discovery directories for skills
- per-capability configuration maps where supported

Rationale:
- Fits existing layered profile loading model.
- Keeps backward compatibility because fields are optional.

Alternatives considered:
- New standalone capability config file. Rejected to avoid fragmented configuration and precedence ambiguity.

### 3) Enforce deterministic precedence and conflict resolution

Precedence order:
1) built-in defaults
2) global profile
3) project profile
4) interactive session overrides

Conflict rules:
- If a capability appears in both enabled and disabled at the same precedence layer, startup fails with a structured validation error.
- Higher-precedence explicit disable overrides lower-precedence enable (and vice versa).

Rationale:
- Predictable behavior and clear debugging.

Alternatives considered:
- Last-write-wins per field without conflict errors. Rejected due to silent misconfiguration risk.

### 4) Integrate skills through existing middleware skills discovery model

CLI reuses existing skill discovery conventions and adds directory sources:
- global: `~/.sisu/skills`
- project: `./.sisu/skills`
- existing default/bundled skill sources where available

Skill installation UX:
- `sisu install-skill` command supports target selection (`--global`, `--project`, explicit `--dir`)
- `skills.sh` can wrap the command for convenience
- manual drop-in remains supported via discovery scan

Rationale:
- Reuses existing skill semantics and lowers implementation risk.

Alternatives considered:
- Custom CLI-only skill format. Rejected to avoid ecosystem divergence.

### 5) Use `@sisu-ai` npm namespace as official capability source

Sisu CLI treats the `@sisu-ai` npm namespace as the official source for Sisu-maintained tools, skills, and middleware package discovery/install metadata.

Scope rules:
- official discovery index for install/search flows is limited to `@sisu-ai/*` packages matching capability patterns
- local/manual capability sources remain supported (for example, folder drop-in skills)
- installed packages still pass catalog/schema validation before activation

Listing behavior:
- CLI provides category listing for official packages (middleware/tools/skills), backed by npm search/query APIs
- results are strictly filtered by prefix (`@sisu-ai/mw-`, `@sisu-ai/tool-`, `@sisu-ai/skill-`) before rendering
- listing output includes package name, version, and short description where available

Rationale:
- Gives users a single trusted source for official capability modules.
- Improves discoverability without requiring a separate hosted marketplace.

Alternatives considered:
- No official namespace source, local/manual only. Rejected due to weaker UX and package discoverability.

### 6) Constrain middleware activation to a vetted catalog with profile-defined ordering/config

Middleware activation is limited to middleware IDs known by CLI runtime, but users get full control over activation order and per-middleware settings through a schema-validated profile structure (for example, a `middleware.pipeline` array of entries like `{ id, enabled, config }`).

Each supported middleware has:
- typed options schema
- initialization hook
- explicit failure behavior
- deterministic ordering semantics based on profile pipeline order

Rationale:
- Prevents arbitrary code execution vectors.
- Keeps startup deterministic and testable.

Alternatives considered:
- Dynamic import by package/path from profile. Rejected for security and reliability reasons.

### 7) Reserve non-negotiable core middleware baseline

CLI runtime defines a small set of core middleware that are always active to preserve chat correctness and safety (for example: runtime invariants/error boundary, tool protocol guardrails, and required lifecycle/state middleware). These entries are exposed as locked in capability views.

Core middleware rules:
- cannot be disabled
- cannot be removed from pipeline
- relative order constraints are fixed
- configurable fields are limited to explicitly safe options only

Rationale:
- Prevents user configuration from breaking fundamental chat behavior.
- Preserves powerful middleware customization for advanced users without destabilizing defaults.

Alternatives considered:
- Fully user-editable pipeline including core middleware. Rejected due to high breakage risk and poor supportability.

### 8) Add interactive capability management commands and setup menu

Chat command surface adds list/enable/disable/show operations and menu shortcuts for tools, skills, and middleware. Interactive updates apply immediately to current session override state and can optionally be persisted.

For middleware specifically, the interactive menu supports:
- toggling middleware on/off
- reordering pipeline entries
- editing per-middleware settings through guided prompts

The CLI also provides a quick "open config in editor" path that launches the effective profile file in the user's configured editor.

Rationale:
- Meets usability goal without forcing manual JSON edits.

Alternatives considered:
- Config-file-only approach. Rejected due to poor discoverability and higher user friction.

### 9) Persist interactive command allow-lists by explicit scope

When users approve or manage command allow-lists interactively, the CLI persists the update based on explicit target scope:
- session scope (in-memory/session store only)
- profile scope (global or project profile file)

Rationale:
- Preserves safety expectations and avoids accidental permanent trust expansion.
- Aligns with existing layered configuration model.

Alternatives considered:
- Always persist interactive approvals to profile. Rejected due to overly broad trust persistence.

### Data flow and middleware/tool interactions

1. Chat startup loads and validates layered profile data.
2. Runtime builds capability registry from built-ins + `@sisu-ai` discovery metadata + local discovered skills + middleware catalog.
3. Resolver computes effective enabled set using precedence/conflict rules.
4. Middleware pipeline is composed from:
   - locked core middleware (required order constraints)
   - user-configurable middleware entries (validated profile-defined order)
5. During assistant/tool flow:
   - tool request is checked against tool policy and effective tool enablement
   - skill invocation is allowed only if the skill is enabled and discovered
   - middleware execution follows configured order with existing runtime boundaries
6. Interactive commands can change session overrides, trigger profile writes, or both, then recompute effective capability state.
7. Interactive command allow-list changes are persisted to session or selected profile scope and used for subsequent policy checks.

### Error handling and cancellation behavior

- Invalid profile fields or capability conflicts fail startup with field-level errors.
- Unknown capability IDs in configuration are reported explicitly; runtime does not silently ignore them.
- Discovery errors for individual skills are surfaced in diagnostics and skipped without crashing unrelated capabilities.
- Middleware initialization errors fail activation for that middleware and produce actionable messages.
- Attempts to disable/remove/reorder locked core middleware fail with explicit diagnostics and remediation guidance.
- Cancellation behavior remains unchanged for active runs; capability updates do not interrupt in-flight tool/provider operations, but apply to subsequent steps/runs.

### Integration points and expected public exports

- `packages/cli/sisu/src/chat/profiles.ts`
  - extend profile types and validation for capability sections
- `packages/cli/sisu/src/chat/runtime.ts`
  - capability registry construction, effective resolution, session overrides
- `packages/cli/sisu/src/chat/commands/*` (or equivalent command handlers)
  - interactive list/enable/disable/show behavior
- `packages/cli/sisu/src/chat/skills/*`
  - directory discovery + loader integration and install command plumbing
- `packages/cli/sisu/src/chat/middleware/*`
  - vetted middleware catalog and option schemas
- `packages/cli/sisu/src/lib.ts`
  - export capability config/runtime contracts needed by tests and integrations

## Risks / Trade-offs

- **[Risk] Capability matrix increases runtime complexity** → Mitigation: single registry/resolver abstraction, focused unit tests for precedence/conflicts.
- **[Risk] Interactive changes may confuse persistence expectations** → Mitigation: explicit prompt for session-only vs profile-persisted changes, clear status output.
- **[Risk] Skill discovery can become noisy with malformed directories** → Mitigation: strict validation, per-skill diagnostics, non-fatal skip semantics.
- **[Risk] Middleware toggles can alter behavior unexpectedly** → Mitigation: conservative defaults, explicit startup summary of active middleware.
- **[Risk] Backward-compatibility regressions in profile loading** → Mitigation: optional fields only, snapshot tests for legacy profiles.

## Migration Plan

1. Add profile schema extensions and validation with optional fields only.
2. Implement capability registry/resolver with current behavior as default baseline.
3. Add skill discovery directory support and installer command plumbing.
4. Add middleware catalog and activation path in runtime composition.
5. Add interactive chat commands/menu integration for capability management.
6. Roll out docs and examples for global/project/session configuration patterns.
7. Validate via unit/integration tests, then run repo lint/build/test gates.

Rollback strategy:
- Disable new capability sections by feature flag or revert to previous profile schema handling.
- Keep existing fixed runtime path available during rollout to minimize risk.

## Open Questions

- Do we allow project profiles to prohibit specific global-enabled capabilities with hard enforcement (team policy mode) in v1 or later?
