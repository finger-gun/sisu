# DT 20260212-0900: Tool Typing and Schema Inference

**Date:** 2026-02-12  
**Status:** Proposal  
**Priority:** High  
**Related:** [Story 003](../stories/story-003-tool-typing-schema-inference.md)

## Context

Tools are central to Sisu, but current tool typing allows `any` for args and schemas. This weakens compile-time safety and makes it harder to trust tool inputs without reading implementation details. We want stronger typing while keeping tools explicit and composable.

## Problem Statement

How can we tighten tool typing so that Zod schemas and TypeScript types stay aligned, without introducing breaking changes or hidden magic?

## Proposed Solution

1. Introduce a typed schema contract for tools (Zod-based).
2. Provide an explicit helper (`defineTool`) to infer args from schema.
3. Keep existing `Tool` usage valid to avoid breaking changes.

## Implementation Plan

1. Update `Tool` typing in `packages/core/src/types.ts` to bind `schema` to a typed Zod schema.
2. Add a new helper in core (e.g., `defineTool`) that infers `TArgs` from schema.
3. Update documentation examples to show typed schema usage and the helper pattern.

## Alternatives Considered

- **Do nothing:** preserves compatibility but leaves `any` holes.
- **Require helper for all tools:** stronger typing but breaking and against Sisu's minimalism.

## Success Criteria

- Tool args are inferred from schemas when using the helper.
- Existing tools compile without changes.
- No change to runtime validation behavior.

## Risks & Mitigations

- **Risk:** Type complexity frustrates users.  
  **Mitigation:** Keep helper optional and provide clear docs.
- **Risk:** Zod type edge cases (refinements, transforms).  
  **Mitigation:** Document limits and avoid altering runtime validation.
