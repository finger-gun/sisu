# Design Topics

Architecture design documents and technical specifications for Sisu features.

---

## Active Design Topics

### DT 20251119-0800: Reasoning Production Readiness

**[dt-20251119-0800-reasoning-production-readiness.md](./dt-20251119-0800-reasoning-production-readiness.md)**

**Date:** 2025-11-19  
**Status:** Analysis Complete  
**Priority:** High  
**Related Stories:** [Story 002](../stories/story-002-reasoning-production-validation.md)

Deep technical analysis of reasoning support production readiness. Identifies gaps, risks, and validation requirements.

**Key Findings:**

- Core implementation: 95% quality
- Production readiness: 70% (needs validation)
- Critical gap: No real API testing
- Timeline: 2-3 weeks to 100% ready

---

### DT 20260212-0900: Tool Typing and Schema Inference

**[dt-20260212-0900-tool-typing-schema-inference.md](./dt-20260212-0900-tool-typing-schema-inference.md)**

**Date:** 2026-02-12  
**Status:** Proposal  
**Priority:** High  
**Related Stories:** [Story 003](../stories/story-003-tool-typing-schema-inference.md)

Strengthen tool typing with schema inference while keeping tools explicit and backward compatible.

---

### DT 20260212-0910: Type-safe LLM Generate Overloads

**[dt-20260212-0910-llm-generate-overloads.md](./dt-20260212-0910-llm-generate-overloads.md)**

**Date:** 2026-02-12  
**Status:** Proposal  
**Priority:** High  
**Related Stories:** [Story 004](../stories/story-004-llm-generate-overloads.md)

Introduce `generate()` overloads keyed by `stream` to remove unsafe adapter casts.

---

### DT 20260212-0920: End-to-End Cancellation Propagation

**[dt-20260212-0920-cancellation-propagation.md](./dt-20260212-0920-cancellation-propagation.md)**

**Date:** 2026-02-12  
**Status:** Proposal  
**Priority:** High  
**Related Stories:** [Story 005](../stories/story-005-cancellation-propagation.md)

Ensure abort signals stop in-flight requests and streaming loops across all adapters.

---

### DT 20260212-0930: Typed Tool Error Wrapping

**[dt-20260212-0930-typed-tool-errors.md](./dt-20260212-0930-typed-tool-errors.md)**

**Date:** 2026-02-12  
**Status:** Proposal  
**Priority:** Medium  
**Related Stories:** [Story 006](../stories/story-006-typed-tool-errors.md)

Standardize tool failures using structured Sisu errors for better traces.

---

### DT 20260212-0940: Shared Tool Schema Conversion

**[dt-20260212-0940-shared-schema-conversion.md](./dt-20260212-0940-shared-schema-conversion.md)**

**Date:** 2026-02-12  
**Status:** Proposal  
**Priority:** Medium  
**Related Stories:** [Story 007](../stories/story-007-shared-schema-conversion.md)

Unify Zod-to-JSON schema conversion across adapters to avoid drift.

---

### DT 20260212-0950: Adapter Logging via Structured Logger

**[dt-20260212-0950-adapter-logger.md](./dt-20260212-0950-adapter-logger.md)**

**Date:** 2026-02-12  
**Status:** Proposal  
**Priority:** Medium  
**Related Stories:** [Story 008](../stories/story-008-adapter-logger.md)

Route adapter logs through structured, redacting loggers for consistent observability.

---

### DT 20260212-1000: Configurable Tool-Calling Limits

**[dt-20260212-1000-tool-calling-limits.md](./dt-20260212-1000-tool-calling-limits.md)**

**Date:** 2026-02-12  
**Status:** Proposal  
**Priority:** Medium  
**Related Stories:** [Story 009](../stories/story-009-tool-calling-limits.md)

Add configurable max-iteration limits to tool-calling middleware with safe defaults.

---

### DT 20251119-0700: Reasoning Model Support

**[dt-20251119-0700-reasoning-model-support.md](./dt-20251119-0700-reasoning-model-support.md)**

**Date:** 2025-11-19  
**Status:** ✅ Implementation Complete  
**Priority:** High  
**Related Stories:** [Story 001](../stories/story-001-reasoning-model-support.md) (Complete)

Complete technical design for OpenAI reasoning model support (o1, o3, ChatGPT 5.1).

**Deliverables:**

- Core type definitions for `reasoning_details` and `reasoning` parameter
- OpenAI adapter request/response handling
- Message preservation for multi-turn contexts
- Streaming support
- Comprehensive test suite

---

### DT 20251119-0700: Reasoning Implementation Summary

**[dt-20251119-0700-reasoning-implementation-summary.md](./dt-20251119-0700-reasoning-implementation-summary.md)**

**Date:** 2025-11-19  
**Status:** ✅ Reference Document  
**Priority:** Medium  
**Related Stories:** [Story 001](../stories/story-001-reasoning-model-support.md)

Quick reference guide with architecture diagrams, data flows, and implementation checklist.

**Contents:**

- Mermaid diagrams of data flow
- File modification summary
- Implementation order
- Success criteria

---

## Design Topics by Status

### ✅ Complete & Implemented

- DT 20251119-0700: Reasoning Model Support
- DT 20251119-0700: Reasoning Implementation Summary

### 🔄 Analysis/In Progress

- DT 20251119-0800: Reasoning Production Readiness

### 📝 Planned

- DT 20260212-0900: Tool Typing and Schema Inference
- DT 20260212-0910: Type-safe LLM Generate Overloads
- DT 20260212-0920: End-to-End Cancellation Propagation
- DT 20260212-0930: Typed Tool Error Wrapping
- DT 20260212-0940: Shared Tool Schema Conversion
- DT 20260212-0950: Adapter Logging via Structured Logger
- DT 20260212-1000: Configurable Tool-Calling Limits

---

## Quick Navigation

### By Topic Area

**Reasoning Models:**

- [dt-20251119-0700-reasoning-model-support.md](./dt-20251119-0700-reasoning-model-support.md) - Design
- [dt-20251119-0700-reasoning-implementation-summary.md](./dt-20251119-0700-reasoning-implementation-summary.md) - Summary
- [dt-20251119-0800-reasoning-production-readiness.md](./dt-20251119-0800-reasoning-production-readiness.md) - Analysis

**Core Types and Tools:**

- [dt-20260212-0900-tool-typing-schema-inference.md](./dt-20260212-0900-tool-typing-schema-inference.md) - Proposal
- [dt-20260212-0930-typed-tool-errors.md](./dt-20260212-0930-typed-tool-errors.md) - Proposal
- [dt-20260212-0940-shared-schema-conversion.md](./dt-20260212-0940-shared-schema-conversion.md) - Proposal

**Adapters and Streaming:**

- [dt-20260212-0910-llm-generate-overloads.md](./dt-20260212-0910-llm-generate-overloads.md) - Proposal
- [dt-20260212-0920-cancellation-propagation.md](./dt-20260212-0920-cancellation-propagation.md) - Proposal
- [dt-20260212-0950-adapter-logger.md](./dt-20260212-0950-adapter-logger.md) - Proposal

**Middleware Control:**

- [dt-20260212-1000-tool-calling-limits.md](./dt-20260212-1000-tool-calling-limits.md) - Proposal

### By Priority

**High:**

- DT 20251119-0800: Reasoning Production Readiness 🔴
- DT 20251119-0700: Reasoning Model Support ✅
- DT 20260212-0900: Tool Typing and Schema Inference
- DT 20260212-0910: Type-safe LLM Generate Overloads
- DT 20260212-0920: End-to-End Cancellation Propagation

**Medium:**

- DT 20251119-0700: Reasoning Implementation Summary
- DT 20260212-0930: Typed Tool Error Wrapping
- DT 20260212-0940: Shared Tool Schema Conversion
- DT 20260212-0950: Adapter Logging via Structured Logger
- DT 20260212-1000: Configurable Tool-Calling Limits

---

## Creating New Design Topics

### Naming Convention

`dt-YYYYMMDD-HHMM-short-descriptive-title.md`

**Example:** `dt-20251119-1430-multi-provider-reasoning.md`

### Template

```markdown
# DT YYYYMMDD-HHMM: Title

**Date:** YYYY-MM-DD  
**Status:** [Proposal|Analysis|Implementation|Complete]  
**Priority:** [High|Medium|Low]  
**Related:** Links to stories, other design topics

## Context

Background and motivation

## Problem Statement

What we're solving

## Proposed Solution

Technical design

## Implementation Plan

How we'll build it

## Alternatives Considered

Other approaches and why not chosen

## Success Criteria

How we measure success

## Risks & Mitigations

What could go wrong and how to handle it
```

---

## Design Topic Lifecycle

```
Proposal → Analysis → Implementation → Complete
   ↓          ↓            ↓             ↓
 Draft     Reviewed    In Progress   Archived
```

**Proposal:** Idea being explored  
**Analysis:** Technical deep-dive in progress  
**Implementation:** Being built (linked to story)  
**Complete:** Implemented and validated

---

## Related Documentation

### Stories

- [Story 001: Reasoning Model Support](../stories/story-001-reasoning-model-support.md) ✅
- [Story 002: Reasoning Production Validation](../stories/story-002-reasoning-production-validation.md) 🔄

### Implementation

- Core Types: [`packages/core/src/types.ts`](../../packages/core/src/types.ts)
- OpenAI Adapter: [`packages/adapters/openai/src/index.ts`](../../packages/adapters/openai/src/index.ts)
- Tests: [`packages/adapters/openai/test/openai.test.ts`](../../packages/adapters/openai/test/openai.test.ts)

### Examples

- [OpenAI Reasoning Example](../../examples/openai-reasoning/)

---

## Design Principles

When creating design topics:

1. **Be Specific:** Clear problem statement and solution
2. **Be Technical:** Include code examples and architecture diagrams
3. **Be Actionable:** Link to implementation stories
4. **Be Complete:** Cover alternatives, risks, and success criteria
5. **Be Dated:** Use timestamp for version tracking

---

## Archive Policy

Design topics are **never deleted**, only archived when:

- Implementation is complete and stable (6+ months)
- Superseded by newer design
- Feature deprecated

Archived topics moved to `archive/` subdirectory but remain accessible.
