## 1. Profile schema and capability registry foundation

- [ ] 1.1 Extend `packages/cli/sisu/src/chat/profiles.ts` profile types and validation schema with optional `tools`, `skills`, and `middleware` capability sections (enabled/disabled lists and typed config maps).
- [ ] 1.2 Implement conflict and unknown-ID validation in profile loading with structured field-level errors for same-layer enable/disable collisions and unrecognized capability IDs.
- [ ] 1.3 Add a capability registry module in `packages/cli/sisu/src/chat/` that models tools, skills, and middleware entries with source metadata and default enablement.
- [ ] 1.4 Implement effective capability resolution logic (defaults → global → project → session override) and unit tests for precedence and backward compatibility.
- [ ] 1.5 Add ordered middleware pipeline schema support in profile types/validation (entry order, duplicate detection, per-entry config payload validation hooks).

## 2. Skill discovery and installation workflows

- [ ] 2.1 Add skill directory resolution for `~/.sisu/skills` and `./.sisu/skills` in CLI chat startup and merge discovered skills into the capability registry with project-over-global precedence.
- [ ] 2.2 Integrate existing skills discovery/validation behavior so malformed skills produce diagnostics while valid skills continue loading.
- [ ] 2.3 Add `sisu install-skill` command surface in `packages/cli/sisu/src/cli.ts` (or command module) supporting `--global`, `--project`, and `--dir`.
- [ ] 2.4 Add scriptable/non-interactive install behavior tests and documentation updates for `skills.sh` wrappers and manual drop-in folder usage.
- [ ] 2.5 Add official capability discovery/install integration for `@sisu-ai` npm namespace and include namespace filtering/validation for official-mode installs.
- [ ] 2.6 Add tests for official discovery search results and namespace-policy rejection paths.
- [ ] 2.7 Add official listing command(s) for middleware/tools/skills categories and render package name/version/description from npm metadata.
- [ ] 2.8 Add strict prefix-filter tests so category listing returns only `@sisu-ai/mw-`, `@sisu-ai/tool-`, or `@sisu-ai/skill-` packages for each category.

## 3. Middleware activation controls

- [ ] 3.1 Create a vetted middleware catalog module (IDs, option schemas, initialization hooks) under `packages/cli/sisu/src/chat/middleware/`.
- [ ] 3.2 Wire middleware activation into chat runtime composition in `packages/cli/sisu/src/chat/runtime.ts` using profile-defined ordered pipeline entries and validated options.
- [ ] 3.3 Implement startup failure paths for unknown middleware IDs and invalid middleware options with explicit error messages.
- [ ] 3.4 Add unit/integration tests for middleware activation, defaults, and startup diagnostics.
- [ ] 3.5 Add middleware interactive setup menu flows for enable/disable, reorder, and settings updates with pre-save validation.
- [ ] 3.6 Add quick "open config in editor" action that opens global/project profile in user's configured editor.
- [ ] 3.7 Define locked core middleware baseline (non-disableable, constrained ordering) and enforce it in profile validation and interactive setup flows.
- [ ] 3.8 Add diagnostics and tests for attempts to disable/remove/reorder locked core middleware entries.

## 4. Interactive capability management in chat

- [ ] 4.1 Add chat commands/menu handlers for listing capability state by category (tools/skills/middleware) including source and override indicators.
- [ ] 4.2 Implement interactive enable/disable flows that update session overrides immediately and report updated effective state.
- [ ] 4.3 Add explicit persistence targeting (session-only vs profile write) with safe profile update routines and path confirmation output.
- [ ] 4.4 Ensure interactive changes apply only to subsequent operations when runs are in-flight; add tests for update safety across active execution boundaries.
- [ ] 4.5 Add interactive command allow-list management that can persist entries to session scope or selected profile scope.

## 5. Safety integration and user-facing docs

- [ ] 5.1 Integrate capability gating into tool/skill invocation pathways so disabled capabilities are rejected with structured status output while preserving existing tool policy checks.
- [ ] 5.2 Update `packages/cli/sisu/README.md` with new profile fields, capability commands, skill discovery paths, and install examples.
- [ ] 5.3 Add migration notes/examples for teams using global + project profile layering.

## 6. Verification and quality gates

- [ ] 6.1 Add/adjust tests in `packages/cli/sisu/test/` for profile validation, registry precedence, skill discovery precedence, middleware activation, and interactive command behavior.
- [ ] 6.2 Run `pnpm lint` and resolve issues introduced by this change.
- [ ] 6.3 Run `pnpm build` and ensure workspace packages compile with new CLI capability modules.
- [ ] 6.4 Run `pnpm test` and verify all new and existing tests pass.
