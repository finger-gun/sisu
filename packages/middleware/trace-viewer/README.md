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
- `enable?: boolean` — force on/off (default: enabled when `--trace` or `TRACE_JSON/TRACE_HTML` present)
- `path?: string` — output target; `.html` writes HTML only, `.json` writes JSON + HTML sidecar (default: `trace.json`)
- `html?: boolean` — write HTML (default `true`)
- `json?: boolean` — write JSON (default `true`)
- `style?: 'light'|'dark'` — built‑in themes (default `light`)
- `template?: (doc, style) => string` — custom HTML renderer

## CLI / Env
- `--trace` or `--trace=run.json|run.html`
- `--trace-style=light|dark`
- `TRACE_JSON=1`, `TRACE_HTML=1`, `TRACE_STYLE=dark`

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
