# Story 006: Typed Tool Error Wrapping

**Status:** 📝 Not Started  
**Priority:** Medium  
**Estimated Effort:** 1-2 days  
**Dependencies:** Story 003  
**Completed:**

---

## Context

Tool calling currently throws generic errors for unknown tools and validation failures, which reduces debuggability and makes traces inconsistent. Sisu already has structured error types; tool middleware should use them consistently.

This aligns with Sisu's explicit, observable error handling philosophy.

## Goals

- Use structured Sisu errors for tool lookup and validation failures.
- Ensure traces show clear, structured error context.
- Preserve current tool-calling behavior for successful paths.

## Non-Goals

- Changing tool-calling semantics or loop logic.
- Altering tool input schemas.

## Acceptance Criteria

- [ ] Unknown tools produce a `ToolExecutionError` with tool name context.
- [ ] Schema validation failures produce a `ValidationError` with zod details.
- [ ] Tool handler exceptions are wrapped with `ToolExecutionError` including cause.
- [ ] Trace viewer shows structured error context for tool failures.

## Implementation Tasks

1. **Wrap errors in tool-calling middleware**
   - Update `packages/middleware/tool-calling/src/index.ts` to catch and wrap errors.
   - Ensure validation errors use `ValidationError`.

2. **Preserve error details**
   - Include tool name, args, and context in `ToolExecutionError`.
   - Ensure cause is preserved for debugging.

3. **Docs update**
   - Add a short note in tool-calling README about error types.

## Testing Checklist

- [ ] Unit test: unknown tool -> `ToolExecutionError`.
- [ ] Unit test: schema invalid -> `ValidationError`.
- [ ] Unit test: handler throws -> `ToolExecutionError` with cause.

## Success Metrics

- Consistent structured errors in traces.
- Improved debugging for tool failures without changing behavior.

## Related Documents

- `packages/middleware/tool-calling/src/index.ts`
- `packages/core/src/errors.ts`
- [DT 20260212-0930: Typed Tool Error Wrapping](../design-topics/dt-20260212-0930-typed-tool-errors.md)
