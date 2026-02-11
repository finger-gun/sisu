# Story 007: Shared Tool Schema Conversion

**Status:** 📝 Not Started  
**Priority:** Medium  
**Estimated Effort:** 2-3 days  
**Dependencies:** Story 003  
**Completed:**

---

## Context

Each adapter currently converts Zod schemas to provider-specific JSON schema separately. Over time, these conversions can drift and produce inconsistent tool behavior across providers. A shared conversion utility would ensure parity while keeping adapters small and explicit.

This supports Sisu's goal of predictable, provider-agnostic tooling.

## Goals

- Create a shared schema conversion utility.
- Ensure consistent JSON schema output across adapters.
- Keep adapter code explicit but reduce duplication.

## Non-Goals

- Changing tool schema semantics or adding new schema features.
- Supporting non-Zod schemas.

## Acceptance Criteria

- [ ] Shared converter is used by OpenAI, Anthropic, and Ollama adapters.
- [ ] JSON schema output matches existing behavior for supported types.
- [ ] `additionalProperties` handling is consistent across providers.
- [ ] Documentation explains supported schema features and limitations.

## Implementation Tasks

1. **Create converter utility**
   - Add a shared module (e.g., `packages/core/src/schema.ts` or `packages/adapters/shared/schema.ts`).
   - Implement a single Zod-to-JSON schema conversion function.

2. **Adopt in adapters**
   - Replace per-adapter converters with the shared function.
   - Keep adapter-specific overrides minimal and explicit.

3. **Tests and validation**
   - Add tests for key schema types used by tools.
   - Snapshot tests to ensure stable JSON schema output.

4. **Docs update**
   - Add a note in tool docs about schema support and limits.

## Testing Checklist

- [ ] Unit tests for shared converter.
- [ ] Adapter tests updated to use shared converter.
- [ ] No regressions in tool-calling across providers.

## Success Metrics

- One canonical schema conversion path.
- No adapter-specific schema drift.

## Related Documents

- `packages/adapters/openai/src/index.ts`
- `packages/adapters/anthropic/src/index.ts`
- `packages/adapters/ollama/src/index.ts`
- [DT 20260212-0940: Shared Tool Schema Conversion](../design-topics/dt-20260212-0940-shared-schema-conversion.md)
