# DT 20260212-1000: Configurable Tool-Calling Limits

**Date:** 2026-02-12  
**Status:** Proposal  
**Priority:** Medium  
**Related:** [Story 009](../stories/story-009-tool-calling-limits.md)

## Context

Tool-calling middleware uses fixed iteration limits, which can truncate longer tool chains. Configurability is needed without compromising safety.

## Problem Statement

How can we make tool-calling limits configurable while preserving safe defaults and predictable behavior?

## Proposed Solution

1. Add `maxIterations` option to tool-calling middleware.
2. Keep current defaults to avoid breaking changes.
3. Emit structured warnings when the cap is reached.

## Implementation Plan

1. Extend middleware options in `packages/middleware/tool-calling/src/index.ts`.
2. Update docs with configuration examples.
3. Add tests for default and custom limits.

## Alternatives Considered

- **No configuration:** simpler but limits valid workflows.
- **Global config:** reduces explicitness and composability.

## Success Criteria

- Users can set limits per middleware instance.
- Default behavior unchanged.
- Trace logs show cap reached clearly.

## Risks & Mitigations

- **Risk:** Setting too high limits may cause long loops.  
  **Mitigation:** Keep defaults and document safe ranges.
