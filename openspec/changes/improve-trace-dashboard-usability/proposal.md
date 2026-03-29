## Why

Developers debugging runs in the trace dashboard can inspect events and download a trace, but they cannot easily copy the filesystem path to the original full trace artifact. This slows down workflows that require opening the trace in an editor, sharing the exact artifact with a teammate, or scripting follow-up analysis outside the dashboard.

## Goals

- Let a developer copy the path to the full trace artifact directly from the trace dashboard while inspecting a run.
- Make the path discoverable enough that developers do not need to guess output locations or inspect the filesystem manually.
- Preserve the current trace generation flow without requiring new runtime configuration.

## Non-goals

- Changing the trace file format or trace storage layout.
- Adding remote sharing, upload, or persistence features for traces.
- Redesigning the overall dashboard navigation beyond what is needed to surface this action clearly.

## What Changes

- Add a user-facing action in the trace dashboard to copy the path to the full trace artifact for the currently viewed run.
- Surface the full trace path inline in the trace title bar so developers can verify what will be copied without adding a separate framed panel.
- Present the copy action as a compact file-copy icon next to the inline path instead of a labeled button.
- Ensure the dashboard handles the cases where only HTML or only JSON output exists and copies the correct full-trace path for that run.
- Add tests covering trace metadata generation and dashboard behavior for copying the full trace path.
- No public TypeScript API changes are intended; this is a usability improvement in the generated trace dashboard experience.

## Target Audience

- Developers using `@sisu-ai/mw-trace-viewer` while debugging local runs.
- Contributors investigating failures, tool behavior, or model responses from generated trace artifacts.

## Intended Use Cases

- Copy the exact full-trace file path from the dashboard and open it in an editor or terminal.
- Paste the trace path into a bug report, script, or teammate message without manually locating the file.
- Verify which artifact on disk corresponds to the run currently displayed in the dashboard.

## Success Metrics

- A developer can copy the full trace path from the dashboard in one interaction while viewing a run.
- The copied value resolves to the artifact written for that run in standard trace output modes.
- Tests cover the metadata and UI behavior needed to keep the action reliable.

## Acceptance Criteria

- The dashboard shows the full trace path for a selected run inline in the title bar and provides a copy action beside it.
- The copied value matches the path of the full trace artifact associated with that run.
- The behavior is defined for JSON-only, HTML-only, and paired JSON+HTML trace output modes.
- Existing trace viewer usage remains backward compatible for consumers of `@sisu-ai/mw-trace-viewer`.

## Capabilities

### New Capabilities
- `trace-dashboard-run-file-access`: Expose the full trace artifact path for a run in the dashboard and let developers copy it for external debugging workflows.

### Modified Capabilities
- None.

## Impact

- Affected code will likely be in `packages/middleware/trace-viewer/src/` and `packages/middleware/trace-viewer/assets/`, plus trace viewer tests.
- User-facing changes are limited to the generated dashboard UI for trace inspection.
- API surface changes: none expected in the public middleware options or trace viewer package exports.
- No new dependencies or external systems are expected.
