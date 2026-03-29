# Sisu Desktop macOS app

SwiftUI shell for the desktop-first Sisu chat experience.

## Features in this scaffold

- Sidebar with runtime status and provider/model selection
- Chat thread list and detail view
- Composer with send/cancel/retry controls
- Branch-from-message action
- Search history panel
- Runtime protocol client using `URLSession` + SSE stream reader
- Message state reconciliation (`pending`, `streaming`, `completed`, `failed`, `cancelled`)

## Build and run

```bash
cd apps/desktop-macos
swift build
swift run SisuDesktopMacOS
```

By default, the app points to `http://127.0.0.1:8787`.

## Runtime troubleshooting

If the app cannot connect:

1. Start runtime:
   - `sisu-runtime-desktop`
2. Confirm health:
   - `curl http://127.0.0.1:8787/health`
3. If using auth, ensure app and runtime share the same token.
4. Ensure runtime binds loopback only (expected for security).
5. Check stream endpoint:
   - `curl -N http://127.0.0.1:8787/streams/<streamId>/events`

## Packaging startup/shutdown checks

For packaged app validation:

1. Launch app and confirm runtime process starts.
2. Send a streaming message and verify token updates.
3. Quit app and verify runtime process exits cleanly.
4. Relaunch and verify prior in-progress messages recover to terminal status.
