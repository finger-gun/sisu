# Story 009: Configurable Tool-Calling Limits

**Status:** 📝 Not Started  
**Priority:** Medium  
**Estimated Effort:** 1 day  
**Dependencies:** Story 006  
**Completed:**

---

## Context

Tool-calling middleware currently uses fixed iteration limits, which can truncate legitimate multi-step tool chains. We should allow configuration while keeping safe defaults to prevent infinite loops.

This supports Sisu's explicit control flow and predictability goals.

## Goals

- Make tool-calling loop limits configurable.
- Keep sensible defaults to avoid runaway tool loops.
- Preserve existing behavior if options are not provided.

## Non-Goals

- Changing loop semantics or tool execution order.
- Adding automatic retries or backoff.

## Acceptance Criteria

- [ ] `toolCalling` and `iterativeToolCalling` accept `maxIterations` options.
- [ ] Default limits match current behavior.
- [ ] Trace viewer shows when max iteration cap is reached.

## Implementation Tasks

1. **Add options to middleware**
   - Extend middleware option types in `packages/middleware/tool-calling/src/index.ts`.
   - Use provided `maxIterations` or fall back to current defaults.

2. **Expose in docs**
   - Update tool-calling README with configuration examples.

3. **Trace message**
   - Emit a structured warning when the cap is reached.

## Testing Checklist

- [ ] Unit test: custom limit respected.
- [ ] Unit test: default limit unchanged.

## Success Metrics

- Users can extend tool chains safely.
- Default behavior unchanged for existing users.

## Related Documents

- `packages/middleware/tool-calling/src/index.ts`
- [DT 20260212-1000: Configurable Tool-Calling Limits](../design-topics/dt-20260212-1000-tool-calling-limits.md)
