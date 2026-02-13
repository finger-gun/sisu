## 1. Lint Error Triage and Baseline

- [x] 1.1 Re-run `pnpm lint` and capture all current errors and warnings
- [x] 1.2 Group issues by rule type and affected package/example

## 2. Fix Lint Errors (Blocking)

- [ ] 2.1 Resolve `no-undef` usages by using proper globals or types (e.g., `globalThis.fetch`, `globalThis.AbortController`)
- [ ] 2.2 Resolve `no-redeclare` conflicts by renaming or restructuring local identifiers without changing behavior
- [ ] 2.3 Replace `{}` placeholder types with `object` or `Record<string, unknown>` as appropriate
- [ ] 2.4 Replace `no-empty` blocks with explicit no-op handling or comments that preserve semantics

## 3. Remove Lint Warnings (Non-Blocking)

- [ ] 3.1 Replace `any` with precise types or `unknown` + narrowing across affected files
- [ ] 3.2 Remove or use unused imports/variables flagged by `no-unused-vars`

## 4. Validate No Behavioral Changes

- [ ] 4.1 Review changes to ensure only type/import adjustments were made
- [ ] 4.2 Re-run `pnpm lint` to confirm zero warnings and errors
