# Story 005: End-to-End Cancellation Propagation

**Status:** 📝 Not Started  
**Priority:** High  
**Estimated Effort:** 2-3 days  
**Dependencies:** Story 004  
**Completed:**

---

## Context

Sisu supports `AbortSignal` on `GenerateOptions`, but adapters do not consistently propagate the signal to network calls or streaming loops. This leads to runaway work and wasted tokens when a request is cancelled. We need consistent, explicit cancellation across providers without changing their public APIs.

This directly supports the framework's reliability and safety goals.

## Goals

- Ensure cancellation aborts in-flight requests for all official adapters.
- Ensure streaming loops stop promptly when aborted.
- Preserve existing adapter behavior when no signal is provided.

## Non-Goals

- Introducing new retry policies.
- Changing model outputs or event formats.

## Acceptance Criteria

- [ ] All adapters pass `signal` to `fetch`/client calls when available.
- [ ] Streaming generators stop when `signal.aborted` is true.
- [ ] Cancellation produces a consistent error type (`CancellationError`) or preserved native abort error where appropriate.
- [ ] Documentation clarifies cancellation support for adapters.

## Implementation Tasks

1. **Core cancellation contract**
   - Validate `GenerateOptions.signal` usage in `packages/core/src/types.ts` docs.

2. **Adapter updates**
   - OpenAI: pass `signal` into fetch and check in stream iteration.
   - Anthropic: wire upstream `signal` instead of a private controller; ensure streaming respects it.
   - Ollama: pass `signal` to fetch and break streaming on abort.

3. **Error handling consistency**
   - Normalize abort errors to `CancellationError` where Sisu already uses typed errors.
   - Ensure trace viewer captures cancellation events.

4. **Docs and examples**
   - Add a small example snippet in core README showing cancellation usage.

## Testing Checklist

- [ ] Unit tests simulate abort during non-streaming call.
- [ ] Unit tests simulate abort during streaming iteration.
- [ ] Integration tests (manual) confirm network cancellation in at least one adapter.

## Success Metrics

- Cancellation stops network activity within a bounded time.
- No unhandled promise rejections when aborted.
- Consistent behavior across adapters.

## Related Documents

- `packages/core/src/types.ts`
- `packages/adapters/openai/src/index.ts`
- `packages/adapters/anthropic/src/index.ts`
- `packages/adapters/ollama/src/index.ts`
- [DT 20260212-0920: End-to-End Cancellation Propagation](../design-topics/dt-20260212-0920-cancellation-propagation.md)
