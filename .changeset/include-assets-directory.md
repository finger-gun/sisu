---
"@sisu-ai/mw-trace-viewer": patch
---

Fix missing assets directory in published package. The `assets/` directory containing viewer.html, viewer.css, and viewer.js files is now included in the npm package, resolving the ENOENT error when HTML trace output is enabled.