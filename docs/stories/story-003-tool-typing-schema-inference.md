# Story 003: Tool Typing and Schema Inference

**Status:** 📝 Not Started  
**Priority:** High  
**Estimated Effort:** 2-3 days  
**Dependencies:** None  
**Completed:**

---

## Context

Tools are one of Sisu's core primitives, but current typing allows `any` for arguments and schemas. This undermines type safety and makes it harder to trust tool inputs at compile time. We want to keep tools simple, explicit, and composable while enabling schema-driven type inference and better editor support.

This story aligns with Sisu's philosophy: minimal core, explicit behavior, and safe defaults. It should not introduce hidden magic; inference should be opt-in and obvious.

## Goals

- Strengthen tool typing without breaking existing tools.
- Align runtime schema validation with compile-time types.
- Keep APIs explicit and ergonomic for users and middleware.

## Non-Goals

- Rewriting existing tools or middleware behavior.
- Introducing non-Zod schemas.
- Changing runtime validation semantics.

## Acceptance Criteria

- [ ] `Tool<TArgs, TResult>` uses a typed Zod schema rather than `any`.
- [ ] Provide a helper to infer `TArgs` from Zod schema (opt-in, explicit).
- [ ] Existing tools continue to compile without changes (backward compatible).
- [ ] No change to runtime behavior or output shapes.
- [ ] Documentation updated to show typed tool definitions.

## Implementation Tasks

1. **Update core tool types**
   - Refine `Tool` typing in `packages/core/src/types.ts` to bind `schema` to `ZodType<TArgs>` (or `ZodTypeAny` with inference helper).
   - Add a `ToolSchema<TArgs>` type alias for reuse.

2. **Add explicit inference helper**
   - Add `createTool` or `defineTool` helper in `packages/core/src/tool.ts` (new) that accepts `schema` and infers `TArgs`.
   - Keep helper optional; existing `Tool` definitions should still work.

3. **Preserve ToolContext contract**
   - No changes to `ToolContext` shape.
   - Ensure tool handlers continue to receive `ToolContext` as today.

4. **Update docs and examples**
   - Update core README examples to show typed schema usage.
   - Provide one example using the new helper to demonstrate inference.

## Testing Checklist

- [ ] Type tests: `Tool` enforces schema arg types.
- [ ] Type tests: `defineTool` infers `TArgs` from schema.
- [ ] Runtime tests unchanged.
- [ ] Existing tool packages build without changes.

## Success Metrics

- Zero breaking changes.
- IDE autocomplete for tool args improves in core and middleware.
- No regression in runtime validation behavior.

## Related Documents

- `packages/core/src/types.ts`
- `packages/core/README.md`
- [DT 20260212-0900: Tool Typing and Schema Inference](../design-topics/dt-20260212-0900-tool-typing-schema-inference.md)
