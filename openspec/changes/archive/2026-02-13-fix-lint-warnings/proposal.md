## Why

Current lint runs report many warnings and a few errors across packages and examples, which blocks clean builds and makes signal-to-noise poor for real regressions. We need a warning- and error-free lint baseline now to enforce code quality without changing runtime behavior.

## What Changes

- Replace `any` usages with explicit, accurate types or `unknown` plus narrowing where appropriate.
- Remove or use unused imports/variables flagged by lint.
- Fix `no-undef` in Node contexts by using proper globals, imports, or types.
- Remove empty blocks or make intent explicit without altering runtime behavior.
- Adjust type placeholders like `{}` to `object` or `unknown` where required.

## Capabilities

### New Capabilities

<!-- None -->

### Modified Capabilities

<!-- None. No spec-level behavior changes are intended. -->

## Impact

- Affects TypeScript sources in packages and examples that currently emit lint warnings/errors.
- No API or runtime behavior changes expected; modifications limited to types and lint cleanliness.
