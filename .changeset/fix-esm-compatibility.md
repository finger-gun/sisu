---
"@sisu-ai/mw-trace-viewer": patch
---

Fix ES module compatibility by removing __dirname usage

This fixes the issue where traceViewer middleware was incompatible with ES modules due to its reliance on `__dirname`, which is not available in ES module scope.

**Changes:**
- Replaced all `__dirname` references with `import.meta.url` and `fileURLToPath` for ES module-compatible path resolution
- Added `fileURLToPath` import from `node:url`
- Updated asset resolution logic in `writeIndexAssets` function to use ES module path resolution
- Maintained backward compatibility with proper fallback for monorepo structure

**Impact:**
- traceViewer middleware now works seamlessly in projects using ES modules (type: "module")
- No breaking changes - existing CommonJS projects continue to work
- Fixes runtime errors when using the middleware in ES module projects

Resolves the bug where projects with `"type": "module"` in package.json could not use the traceViewer middleware.