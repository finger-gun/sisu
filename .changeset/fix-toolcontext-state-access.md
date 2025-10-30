---
"@sisu-ai/tool-azure-blob": patch
"@sisu-ai/tool-web-search-openai": patch
---

Fix TypeScript compilation errors by migrating from ctx.state to ctx.deps

Tools were incorrectly accessing ctx.state which doesn't exist on ToolContext interface. Updated to use ctx.deps for dependency injection following the sandboxed tool architecture pattern. This fixes CI build failures while maintaining backward compatibility with environment variables.