# Story 004: Type-safe LLM Generate Overloads

**Status:** 📝 Not Started  
**Priority:** High  
**Estimated Effort:** 1-2 days  
**Dependencies:** Story 003  
**Completed:**

---

## Context

`LLM.generate()` supports streaming and non-streaming responses but is currently typed as a union return. This forces adapters to cast and hides type mismatches. We want explicit overloads that keep the API predictable, clarify streaming vs non-streaming paths, and eliminate unsafe casts.

This aligns with Sisu's vision of explicit, testable behavior and reduces hidden assumptions in adapters.

## Goals

- Introduce overloads for `generate()` keyed by `stream` option.
- Eliminate `as unknown as LLM['generate']` in adapters.
- Preserve existing runtime behavior.

## Non-Goals

- Changing the streaming event format.
- Introducing new adapter features.

## Acceptance Criteria

- [ ] `LLM.generate` has overloads for `stream: true` and `stream: false | undefined`.
- [ ] Adapter implementations conform to overloads without casts.
- [ ] Public types remain backward compatible for callers.
- [ ] Documentation clarifies streaming vs non-streaming signatures.

## Implementation Tasks

1. **Update core types**
   - Modify `LLM` interface in `packages/core/src/types.ts` with overload signatures.
   - Ensure `GenerateOptions` includes `stream?: boolean` (already present if applicable).

2. **Refactor adapters**
   - Update OpenAI, Anthropic, and Ollama adapters to match overloads and remove unsafe casts.
   - Keep runtime logic unchanged; this is a typing refactor only.

3. **Update docs**
   - In core README, add explicit examples for streaming vs non-streaming usage.

## Testing Checklist

- [ ] Type tests for overload resolution.
- [ ] Adapters compile without casts.
- [ ] Runtime tests remain green.

## Success Metrics

- No `unknown` casts for adapter `generate` implementations.
- Clear editor hints for `stream` usage.

## Related Documents

- `packages/core/src/types.ts`
- `packages/adapters/openai/src/index.ts`
- `packages/adapters/anthropic/src/index.ts`
- `packages/adapters/ollama/src/index.ts`
- [DT 20260212-0910: Type-safe LLM Generate Overloads](../design-topics/dt-20260212-0910-llm-generate-overloads.md)
