# DT 20260212-0910: Type-safe LLM Generate Overloads

**Date:** 2026-02-12  
**Status:** Proposal  
**Priority:** High  
**Related:** [Story 004](../stories/story-004-llm-generate-overloads.md)

## Context

Sisu adapters support both streaming and non-streaming responses through a single `generate()` method, but the current typing uses a union return. This forces unsafe casts in adapters and makes the API less explicit.

## Problem Statement

How can we provide explicit, type-safe overloads for streaming vs non-streaming without changing runtime behavior?

## Proposed Solution

1. Add overloads to the `LLM.generate()` signature keyed by `options.stream`.
2. Update adapters to implement the overloads directly.
3. Keep caller code backward compatible.

## Implementation Plan

1. Update `packages/core/src/types.ts` with overload signatures.
2. Refactor adapters to remove `as unknown` casts.
3. Update documentation with streaming and non-streaming examples.

## Alternatives Considered

- **Single union return type:** simple but unsafe and encourages casts.
- **Separate methods for streaming:** clearer but introduces breaking changes.

## Success Criteria

- No `as unknown` casts remain in adapters.
- Callers get accurate editor hints for `stream: true`.
- Runtime behavior unchanged.

## Risks & Mitigations

- **Risk:** Overload resolution confusing for users.  
  **Mitigation:** Add clear examples and keep defaults explicit.
