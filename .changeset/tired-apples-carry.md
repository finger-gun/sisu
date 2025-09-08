---
"@sisu-ai/mw-trace-viewer": major
---

A new, more efficient way for the trace viewer to display and load trace runs by generating a lightweight index (`SISU_RUN_INDEX`) in `runs.js`. This enables the viewer to quickly render a summary list of runs and only load full run details on demand, improving performance for directories with many traces. The changes also update the viewer logic and tests to support and verify this new index-based approach.

Key changes:

**Trace viewer asset generation and index creation:**

* The `writeIndexAssets` function in `src/index.ts` now generates a lightweight index of runs (`SISU_RUN_INDEX`) in `runs.js`, summarizing each trace run with id, file, title, time, status, and duration, preferring `.js` files for loading to avoid CORS issues.

**Viewer UI and loading logic:**

* `viewer.js` is updated to use the new `SISU_RUN_INDEX` for rendering the run list and lazy-loading detailed run data only when a run is selected, falling back to the old behavior if the index is not present. This includes new helper functions like `ensureRunLoaded` and updates to filtering and selection logic. 

**Testing improvements:**

* Tests in `trace-viewer.test.ts` are updated to verify that `runs.js` is created with a valid lightweight index and that the index contains the expected summary fields for each run, both for standard and html-only outputs. 