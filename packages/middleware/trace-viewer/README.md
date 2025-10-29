# @sisu-ai/mw-trace-viewer

Export run traces as JSON + HTML with one middleware.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![CodeQL](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fmw-trace-viewer)](https://www.npmjs.com/package/@sisu-ai/mw-trace-viewer)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

## Setup
```bash
npm i @sisu-ai/mw-trace-viewer
```

## Usage
```ts
import { traceViewer } from '@sisu-ai/mw-trace-viewer';

const app = new Agent()
  .use(traceViewer({ style: 'dark' }))
  // ...rest of your pipeline
```

## Options
- `enable?: boolean` — force on/off (default: enabled when `--trace` or `TRACE_JSON=1/TRACE_HTML=1` present)
- `path?: string` — output target; `.html` writes HTML only, `.json` writes JSON + HTML sidecar (default: `trace.json`)
- `html?: boolean` — write HTML (default `true`, or controlled by `TRACE_HTML=1` env var)
- `json?: boolean` — write JSON (default `true`, or controlled by `TRACE_JSON=1` env var)
- `style?: 'light'|'dark'` — built‑in themes (default `light`)
- `template?: (doc, style) => string` — custom HTML renderer
- `dir?: string` — directory for traces when no explicit path given (default: `traces`)

## CLI / Env
- `--trace` or `--trace=run.json|run.html` — enable tracing with optional output path
- `--trace-style=light|dark` — set theme via CLI
- `TRACE_JSON=1` — enable tracing and control JSON output (only JSON if set alone)
- `TRACE_HTML=1` — enable tracing and control HTML output (only HTML if set alone)
- `TRACE_STYLE=dark` — set theme via env var

**Priority:** Options passed to `traceViewer()` always take precedence over env vars. If neither are set, both HTML and JSON are written by default.

## What’s captured
- `input`, `final` message text
- Full `messages` array
- `events` from the tracing logger (wraps `ctx.log` under the hood)
 
# Community & Support

Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu. Example projects live under [`examples/`](https://github.com/finger-gun/sisu/tree/main/examples) in the repo.


- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
