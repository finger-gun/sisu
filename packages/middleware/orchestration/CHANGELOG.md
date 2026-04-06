# @sisu-ai/mw-orchestration

## 3.0.0

### Patch Changes

- Updated dependencies [3f417c7]
  - @sisu-ai/core@2.6.0

## 2.0.0

### Patch Changes

- Updated dependencies [aa659d9]
  - @sisu-ai/core@2.5.0

## 1.0.0

### Patch Changes

- Updated dependencies
  - @sisu-ai/core@2.4.0

## 0.2.2

### Patch Changes

- Polish package README intros for better npm discoverability and SEO.

  This release updates package documentation openings to be clearer and more benefit-focused, improving first impression and package listing snippets on npm.

- Updated dependencies
  - @sisu-ai/core@2.3.3

## 0.2.1

### Patch Changes

- Patch release across all published `@sisu-ai/*` packages.

  This release increments patch versions for the full package set to publish the latest internal improvements and documentation updates.

- Updated dependencies
  - @sisu-ai/core@2.3.2

## 0.2.0

### Minor Changes

- Add orchestration middleware for delegated multi-agent execution in Sisu.

  This release introduces `@sisu-ai/mw-orchestration` with a delegate-first control surface (`delegateTask` and `finish`), scoped child execution, explicit orchestration state, and structured delegation results for traceable parent/child runs.

  It also includes policy-oriented improvements for real-world robustness, including pluggable delegation hooks, normalized delegation input handling, structured error codes/hints for model self-correction, and bounded correction retries.
