# DT 20260212-0920: End-to-End Cancellation Propagation

**Date:** 2026-02-12  
**Status:** Proposal  
**Priority:** High  
**Related:** [Story 005](../stories/story-005-cancellation-propagation.md)

## Context

`GenerateOptions` supports `AbortSignal`, but adapters do not consistently pass it to network calls or stop streaming loops. This causes unnecessary work and token costs when requests are cancelled.

## Problem Statement

How do we ensure cancellation propagates through all adapters and streaming paths without changing adapter APIs?

## Proposed Solution

1. Pass `signal` to all `fetch` or client calls in adapters.
2. Check `signal.aborted` within streaming generators and stop promptly.
3. Normalize abort errors to a consistent typed error when appropriate.

## Implementation Plan

1. Update OpenAI, Anthropic, and Ollama adapters to accept and use `signal`.
2. Add tests that simulate abort during streaming and non-streaming calls.
3. Update docs to highlight cancellation support and patterns.

## Alternatives Considered

- **Rely on provider SDK defaults:** inconsistent and not explicit.
- **Ignore cancellation for streaming:** reduces reliability and wastes tokens.

## Success Criteria

- Abort stops in-flight requests across all adapters.
- Streaming stops quickly after cancellation.
- No unhandled promise rejections on abort.

## Risks & Mitigations

- **Risk:** Provider SDKs ignore `AbortSignal`.  
  **Mitigation:** Use native fetch where possible or document limitations.
