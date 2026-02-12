---
name: debug
description: Systematic debugging workflow from reproduction to root cause
version: 0.1.0
author: sisu
tags: [debug, troubleshooting]
requires: [read_file, grep, bash]
---

# Debugging Workflow

Use this skill to debug issues systematically.

## Steps

1. **Reproduce** the issue with minimal steps
2. **Collect signals** (logs, traces, stack traces)
3. **Narrow scope** (binary search, isolating module)
4. **Hypothesize** and test fixes
5. **Verify** the fix with tests and regression checks

## Resources

See `resources/debug-playbook.md`.
