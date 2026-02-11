# DT 20260212-0930: Typed Tool Error Wrapping

**Date:** 2026-02-12  
**Status:** Proposal  
**Priority:** Medium  
**Related:** [Story 006](../stories/story-006-typed-tool-errors.md)

## Context

Tool calling currently throws generic errors for unknown tools or schema failures. Sisu already has structured errors, but they are not consistently used in tool middleware.

## Problem Statement

How can we standardize tool errors so they are structured, traceable, and consistent without changing tool behavior?

## Proposed Solution

1. Wrap unknown tool lookups in `ToolExecutionError` with context.
2. Wrap schema validation failures in `ValidationError` with details.
3. Wrap tool handler exceptions in `ToolExecutionError` with `cause`.

## Implementation Plan

1. Update `packages/middleware/tool-calling/src/index.ts` error handling.
2. Ensure trace viewer surfaces error context (already supported).
3. Add unit tests for the three failure modes.

## Alternatives Considered

- **Keep generic errors:** simpler but poor observability.
- **Introduce new error types:** unnecessary given existing structured errors.

## Success Criteria

- Tool failures are structured and show up in traces consistently.
- No change to success path behavior.

## Risks & Mitigations

- **Risk:** Double-wrapping errors obscures original message.  
  **Mitigation:** Preserve original error as `cause`.
