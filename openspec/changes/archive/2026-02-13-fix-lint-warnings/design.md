## Context

Lint currently fails due to a mix of `no-undef`, `no-unused-vars`, `no-empty`, `no-empty-object-type`, and widespread `no-explicit-any` warnings across packages and examples. The change must preserve runtime behavior and public API while achieving zero lint warnings and errors. The work spans multiple modules and examples, so coordination and consistent patterns are needed.

## Goals / Non-Goals

**Goals:**

- Eliminate all lint errors and warnings from `pnpm lint` without changing behavior.
- Replace `any` with precise types or `unknown` plus narrowing and type guards.
- Remove unused imports/variables or make intentional usage explicit.
- Fix `no-undef` by using proper globals, types, or runtime-safe imports.

**Non-Goals:**

- No refactors that change logic, data flow, or public APIs.
- No new dependencies or runtime polyfills.
- No behavior changes in examples or packages.

## Decisions

- Prefer `unknown` with explicit narrowing over `any` to preserve type safety while avoiding behavior changes. Alternative: introduce new interfaces for all shapes; rejected when it forces broader refactors with risk.
- Use `globalThis`-scoped types or existing environment typings to address `no-undef` for `fetch`, `Response`, `AbortController`, `TextDecoder`, `setTimeout`, and `clearTimeout`. Alternative: add runtime shims or new deps; rejected to avoid behavior changes.
- Replace `{}` type placeholders with `object` or `Record<string, unknown>` based on intent. Alternative: keep `{}` and suppress lint; rejected to keep lint clean without disable comments.
- Remove empty blocks by adding explicit comments or minimal no-op handling that preserves semantics. Alternative: disable `no-empty`; rejected to avoid loosening lint rules.

## Risks / Trade-offs

- [Risk] Type adjustments could unintentionally constrain generic usage → Mitigation: prefer `unknown` + narrowing and keep public types broad.
- [Risk] `no-undef` fixes may require environment-specific typings → Mitigation: use existing TypeScript lib types and `globalThis` references without runtime changes.
- [Risk] Lint warning removals in examples could drift from educational intent → Mitigation: keep example logic identical and only adjust types/import usage.
