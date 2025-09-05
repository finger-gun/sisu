# @sisu-ai/mw-trace-viewer

Export run traces as JSON + HTML with one middleware.

## Setup
```bash
npm i @sisu-ai/mw-trace-viewer
```

## Documentation
Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu

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
- `style?: 'light'|'dark'|'modern'` — built‑in themes (default `light`)
- `template?: (doc, style) => string` — custom HTML renderer

## CLI / Env
- `--trace` or `--trace=run.json|run.html`
- `--trace-style=light|dark|modern`
- `TRACE_JSON=1`, `TRACE_HTML=1`, `TRACE_STYLE=dark`

## What’s captured
- `input`, `final` message text
- Full `messages` array
- `events` from the tracing logger (wraps `ctx.log` under the hood)
 
# Community & Support
- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
