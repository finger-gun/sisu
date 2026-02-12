---
name: test-gen
description: Generate comprehensive tests using Vitest with edge cases
version: 0.1.0
author: sisu
tags: [tests, vitest, coverage]
requires: [read_file, grep]
---

# Test Generation

Use this skill to generate tests that meet SISU's coverage standards.

## Goals

- Cover happy path, edge cases, and invalid inputs
- Use Vitest syntax and patterns
- Keep tests deterministic and isolated

## Steps

1. Identify target module and public behavior
2. Enumerate input variations
3. Generate tests for error handling and cancellation
4. Validate coverage thresholds (≥ 80%)

## Resources

See `resources/vitest-patterns.md` for patterns and examples.
