# DT 20260212-0940: Shared Tool Schema Conversion

**Date:** 2026-02-12  
**Status:** Proposal  
**Priority:** Medium  
**Related:** [Story 007](../stories/story-007-shared-schema-conversion.md)

## Context

Each adapter maintains its own Zod-to-JSON schema conversion logic. This can drift and cause inconsistent tool schemas across providers.

## Problem Statement

How can we unify schema conversion to ensure consistent tool behavior across providers while keeping adapters explicit?

## Proposed Solution

1. Add a shared converter module in core or a shared adapters package.
2. Replace adapter-specific converters with the shared utility.
3. Document supported schema features and known limitations.

## Implementation Plan

1. Create `toJsonSchema` (name TBD) and export from core/shared.
2. Update OpenAI, Anthropic, and Ollama adapters to use it.
3. Add tests for common Zod patterns used by tools.

## Alternatives Considered

- **Leave per-adapter converters:** higher maintenance and inconsistent behavior.
- **Switch to external JSON schema lib:** adds dependency and may conflict with provider specifics.

## Success Criteria

- All adapters produce consistent schema output for identical tools.
- No regressions in existing tool behavior.

## Risks & Mitigations

- **Risk:** Converter cannot perfectly match provider quirks.  
  **Mitigation:** Allow adapter-specific overrides but keep shared defaults.
