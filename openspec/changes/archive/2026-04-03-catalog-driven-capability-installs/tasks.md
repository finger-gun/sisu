## 1. Discovery package foundation (`@sisu-ai/discovery`)

- [x] 1.1 Create a new workspace package for discovery metadata (e.g. `packages/discovery`) with typed exports for catalog entries, install recipes, and schema version.
- [x] 1.2 Add generation logic that derives official package catalog data from monorepo package metadata and emits deterministic JSON consumed by the discovery package.
- [x] 1.3 Add validation for generated entries (required fields, category mapping, package-name format) and fail generation on invalid metadata.
- [x] 1.4 Wire discovery package build/publish flow so CLI can consume it as a dependency independent of repository co-location.

## 2. CLI discovery integration

- [x] 2.1 Refactor `packages/cli/sisu/src/chat/npm-discovery.ts` to use `@sisu-ai/discovery` catalog as primary source for official tools/middleware/skills.
- [x] 2.2 Preserve fallback behavior for discovery-source failures by keeping custom package install path available with actionable error output.
- [x] 2.3 Update capability listing surfaces (`runtime` commands and settings menus) to display discovery-package metadata (name/version/description) consistently.

## 3. Recipe executor and install orchestration

- [x] 3.1 Extend `packages/cli/sisu/src/chat/capability-install.ts` with recipe execution support for ordered install steps and post-install config actions.
- [x] 3.2 Implement step-level result reporting (success/failure/completed steps) and stop execution on unrecoverable step failure.
- [x] 3.3 Ensure recipe execution is shared between settings-driven and command-driven install entry points.
- [x] 3.4 Keep existing direct `/install <tool|middleware> <name> [project|global]` behavior backward compatible while adding recipe-capable install paths.

## 4. Guided RAG install flows

- [x] 4.1 Add `rag-recommended` recipe that installs `@sisu-ai/tool-rag`, `@sisu-ai/mw-rag`, and `@sisu-ai/vector-vectra`, then applies required default config wiring.
- [x] 4.2 Add `rag-advanced` recipe path with backend selection (`vectra`, `chroma`, `custom`) and corresponding vector store configuration writes.
- [x] 4.3 Implement cancellation-safe guided flow behavior in settings UI so canceling before confirmation performs no installs or config writes.
- [x] 4.4 Add install UX entry points at top-level tools/middleware setup menus (not tool-specific config submenus).

## 5. Tests, validation, and documentation

- [x] 5.1 Add tests for discovery package generation and schema validation (including malformed metadata failure cases).
- [x] 5.2 Add/extend CLI tests for catalog-driven listings, discovery-failure fallback behavior, and custom package fallback path.
- [x] 5.3 Add/extend CLI tests for recipe execution across success, failure, and cancellation paths (including parity between command and menu triggers).
- [x] 5.4 Add/extend RAG-specific tests for recommended defaults and advanced backend selection (`vectra`/`chroma`/custom).
- [x] 5.5 Update relevant user docs/help text for catalog-driven installs, guided RAG setup, and discovery package behavior.
- [x] 5.6 Run `pnpm --filter @sisu-ai/cli lint`, `pnpm --filter @sisu-ai/cli typecheck`, `pnpm --filter @sisu-ai/cli test`, and `pnpm test`; fix regressions before marking complete.
