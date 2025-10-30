---
"@sisu-ai/tool-azure-blob": patch
"@sisu-ai/tool-vec-chroma": patch
---

Fix ToolContext dependency injection and chromadb package installation

- **@sisu-ai/tool-azure-blob**: Updated tests to use `ctx.deps` instead of `ctx.state` (aligning with implementation)
- **@sisu-ai/tool-vec-chroma**: Fixed source code to use `ctx.deps` instead of `ctx.state` for proper dependency injection following the sandboxed tool architecture pattern.
- All 207 tests now passing with 81.89% coverage.