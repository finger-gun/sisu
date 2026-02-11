# DT 20260212-0950: Adapter Logging via Structured Logger

**Date:** 2026-02-12  
**Status:** Proposal  
**Priority:** Medium  
**Related:** [Story 008](../stories/story-008-adapter-logger.md)

## Context

Adapters currently use `console.warn` and `console.error`, which bypass Sisu's redacting logger and trace capture. This creates a safety gap and inconsistent observability.

## Problem Statement

How can we route adapter logs through structured logging while keeping adapter APIs backward compatible?

## Proposed Solution

1. Accept an optional `log` in adapter options (type `Logger`).
2. Replace `console.*` with `log.*` when available, no-op otherwise.
3. Ensure logs pass through redaction and trace capture when using `ctx.log`.

## Implementation Plan

1. Update adapter option types to include `log?: Logger`.
2. Refactor log calls in adapters to use the injected logger.
3. Document logging option in adapter READMEs.

## Alternatives Considered

- **Keep console usage:** simplest but undermines redaction and traces.
- **Require logger in all adapters:** breaking change.

## Success Criteria

- No direct `console.*` usage in adapter code.
- Logs are captured when trace viewer is enabled.
- No breaking changes for existing users.

## Risks & Mitigations

- **Risk:** Logger is missing and logs silently disappear.  
  **Mitigation:** Document default behavior and recommend `ctx.log` injection.
