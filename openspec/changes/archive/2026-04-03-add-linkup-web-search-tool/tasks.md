## 1. OpenSpec and capability definition

- [x] 1.1 Finalize proposal at `openspec/changes/add-linkup-web-search-tool/proposal.md` with scope, capability, and impact details.
- [x] 1.2 Finalize design at `openspec/changes/add-linkup-web-search-tool/design.md` with data flow, integration points, and risk trade-offs.
- [x] 1.3 Finalize capability spec at `openspec/changes/add-linkup-web-search-tool/specs/linkup-web-search-tool/spec.md`.

## 2. Implement LinkUp tool package

- [x] 2.1 Create `packages/tools/web-search-linkup/package.json`, `tsconfig.json`, and source/test folders following existing tool package conventions.
- [x] 2.2 Implement `packages/tools/web-search-linkup/src/index.ts` with `linkupWebSearch` tool export, strict Zod input schema, and deterministic API key resolution.
- [x] 2.3 Add `linkup-sdk` dependency and map supported options (`query`, `depth`, `outputType`, `includeImages`, date/domain/citation/source filters, `maxResults`, `structuredOutputSchema`) into `LinkupClient.search`.
- [x] 2.4 Add explicit provider error handling for missing key and failed SDK calls without silent fallbacks.

## 3. Tests and documentation

- [x] 3.1 Add unit tests in `packages/tools/web-search-linkup/test/linkup-web-search.test.ts` for defaults, mapping behavior, deps/env key precedence, and provider error propagation.
- [x] 3.2 Add package documentation in `packages/tools/web-search-linkup/README.md` with installation, configuration, and usage examples.
- [x] 3.3 Add package changelog in `packages/tools/web-search-linkup/CHANGELOG.md`.
- [x] 3.4 Update repository-level docs references (`README.md`, `skills/sisu-framework/TOOLS.md`) to include the new LinkUp tool package.

## 4. Discovery and verification

- [x] 4.1 Regenerate discovery catalog via `pnpm --filter @sisu-ai/discovery build` so `packages/discovery/src/generated/catalog.json` includes the new tool package.
- [x] 4.2 Run `pnpm lint` and fix any issues introduced by this change.
- [x] 4.3 Run `pnpm build` to verify all workspaces compile successfully.
- [x] 4.4 Run `pnpm test` to verify new and existing tests pass.
