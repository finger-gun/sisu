---
'@sisu-ai/mw-trace-viewer': patch
---

Fix `html` and `json` options to work correctly when passed to `traceViewer()`. Previously, these options were ignored and environment variables (`TRACE_HTML=1`, `TRACE_JSON=1`) were required to control output. Now:

- `opts.html` and `opts.json` take precedence when explicitly set
- Environment variables serve as defaults when options are not provided
- Backward compatibility maintained: both HTML and JSON written by default