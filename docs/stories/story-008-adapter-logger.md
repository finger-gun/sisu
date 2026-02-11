# Story 008: Adapter Logging via Structured Logger

**Status:** 📝 Not Started  
**Priority:** Medium  
**Estimated Effort:** 1-2 days  
**Dependencies:** Story 003  
**Completed:**

---

## Context

Adapters currently use `console.warn`/`console.error`, which bypasses Sisu's redacting logger and trace capture. This undermines observability and can leak sensitive info. We should route adapter logs through structured logging that supports redaction and tracing.

This aligns with Sisu's observability and safety principles.

## Goals

- Route adapter logs through `ctx.log` or an injected logger.
- Preserve existing log messages while ensuring redaction.
- Avoid breaking changes for adapter consumers.

## Non-Goals

- Removing all logging from adapters.
- Changing log formats or levels unless required.

## Acceptance Criteria

- [ ] Adapters no longer use `console.*` directly.
- [ ] Logging flows through structured logger with redaction.
- [ ] Trace viewer captures adapter logs when enabled.
- [ ] Adapter options allow logger injection for non-ctx usage.

## Implementation Tasks

1. **Define logging contract**
   - Decide on adapter logger signature (e.g., `log?: Logger` in adapter options).
   - Ensure default behavior preserves current logs when `log` is absent.

2. **Refactor adapters**
   - Replace `console.*` calls in OpenAI, Anthropic, Ollama adapters.
   - Prefer provided logger or a no-op fallback.

3. **Docs update**
   - Document adapter logging options.
   - Mention redaction support.

## Testing Checklist

- [ ] Unit test: adapter logs use injected logger.
- [ ] No console usage remains in adapters.

## Success Metrics

- All adapter logs are redacted and traceable.
- No breaking changes for current consumers.

## Related Documents

- `packages/adapters/openai/src/index.ts`
- `packages/adapters/anthropic/src/index.ts`
- `packages/adapters/ollama/src/index.ts`
- `packages/core/src/util.ts`
- [DT 20260212-0950: Adapter Logging via Structured Logger](../design-topics/dt-20260212-0950-adapter-logger.md)
