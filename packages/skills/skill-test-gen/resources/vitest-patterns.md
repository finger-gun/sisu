# Vitest Patterns

## Structure

```ts
import { describe, it, expect } from "vitest";

describe("feature", () => {
  it("handles happy path", () => {
    /* ... */
  });
  it("handles invalid input", () => {
    /* ... */
  });
});
```

## Coverage Guidance

- Include edge cases and negative paths
- Use table-driven tests for permutations
- Avoid network or file I/O without mocks
