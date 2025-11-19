# Design Topics

This directory contains architectural design documents and implementation plans for Sisu features.

## Reasoning Model Support

### Documents

1. **[reasoning-model-support.md](reasoning-model-support.md)** - Complete technical design
   - Problem statement and current gaps
   - Detailed solution design
   - Phase-by-phase implementation plan
   - Type definitions and code examples

2. **[reasoning-implementation-summary.md](reasoning-implementation-summary.md)** - Quick reference
   - Data flow diagrams
   - Architecture overview with Mermaid diagrams
   - File modification summary
   - Implementation order and dependencies
   - Success criteria and risk mitigation

3. **[../stories/reasoning-model-support.md](../stories/reasoning-model-support.md)** - User story
   - Acceptance criteria
   - Step-by-step implementation guide
   - Test cases with code
   - Example usage code
   - Documentation updates

### Summary

The reasoning model support feature enables Sisu to work with OpenAI's thinking models (o1, o3, ChatGPT 5.1) that provide extended reasoning capabilities. The implementation:

- ✅ **Zero breaking changes** - all additions are optional
- ✅ **Type-safe** - proper TypeScript types for all new fields
- ✅ **Well-tested** - 6 new comprehensive test cases
- ✅ **Documented** - examples and README updates included

### Key Changes

| Component | Change | Impact |
|-----------|--------|--------|
| [`AssistantMessage`](../core/src/types.ts:29) | Add `reasoning_details?: unknown` | Stores opaque reasoning data from API |
| [`GenerateOptions`](../core/src/types.ts:54) | Add `reasoning?: boolean \| object` | Enables reasoning parameter in requests |
| OpenAI Adapter | Multiple updates | Handle reasoning in request/response/messages |
| Tests | 6 new test cases | Verify reasoning functionality |
| Examples | `reasoning-model.ts` | Show proper usage |
| Docs | README updates | Document feature |

### Implementation Ready

All planning documents are complete. The implementation can proceed in Code mode following the step-by-step guide in the user story document.

### Quick Start (for implementer)

1. Read [reasoning-implementation-summary.md](reasoning-implementation-summary.md) first (5 min)
2. Reference [../stories/reasoning-model-support.md](../stories/reasoning-model-support.md) for implementation steps
3. Consult [reasoning-model-support.md](reasoning-model-support.md) for detailed technical context
4. Implement in the order specified in the summary document
5. Run tests after each major change
6. Create changeset when complete

### Related Files

- [`packages/core/src/types.ts`](../../packages/core/src/types.ts) - Core type definitions
- [`packages/adapters/openai/src/index.ts`](../../packages/adapters/openai/src/index.ts) - OpenAI adapter
- [`packages/adapters/openai/test/openai.test.ts`](../../packages/adapters/openai/test/openai.test.ts) - Tests