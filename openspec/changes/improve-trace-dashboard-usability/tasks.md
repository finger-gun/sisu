## 1. Trace Metadata

- [x] 1.1 Update `packages/middleware/trace-viewer/src/index.ts` to record the selected run's full trace artifact path in the generated run payload and lightweight index for JSON, HTML-only, and paired output modes.
- [x] 1.2 Extend `packages/middleware/trace-viewer/test/trace-viewer.test.ts` to verify the full trace path metadata is emitted correctly for the supported output modes.

## 2. Dashboard UI

- [x] 2.1 Update `packages/middleware/trace-viewer/assets/viewer.js` and `packages/middleware/trace-viewer/assets/viewer.html` to render the selected run's full trace path inline in the title bar when the metadata is present.
- [x] 2.2 Add a chrome-free icon copy action beside the inline path in `packages/middleware/trace-viewer/assets/viewer.js` and `packages/middleware/trace-viewer/assets/viewer.css`, and safely handle runs that do not include path metadata.

## 3. Verification

- [x] 3.1 Add or update trace viewer coverage to verify the dashboard copy-path behavior and older runs without path metadata remain usable.
- [x] 3.2 Run `pnpm --filter @sisu-ai/mw-trace-viewer test`, `pnpm --filter @sisu-ai/mw-trace-viewer build`, and any required lint or typecheck commands to validate the change end to end.
