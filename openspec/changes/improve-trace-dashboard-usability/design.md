## Context

`@sisu-ai/mw-trace-viewer` has two relevant layers for this change. The middleware in `packages/middleware/trace-viewer/src/index.ts` decides where trace artifacts are written and generates the lightweight `runs.js` index used by the dashboard. The dashboard in `packages/middleware/trace-viewer/assets/viewer.js` loads run summaries and detailed run payloads, then renders run metadata and user actions such as exporting JSON and copying message content.

The usability gap is that the writer knows the artifact path, but the dashboard does not currently expose that path to the developer. Because the run index is already the contract between trace generation and the browser UI, the least invasive implementation is to include full-trace file path metadata in the generated run payloads and render a dedicated copy action in the dashboard.

This is a cross-module change because it touches trace generation, index generation, and browser rendering, but it does not require a new package, dependency, or public middleware option.

## Goals / Non-Goals

**Goals:**
- Make the full trace artifact path available for each run displayed in the trace dashboard.
- Add a clear dashboard action to copy that path while viewing a selected run.
- Keep behavior correct for JSON-only, HTML-only, and paired JSON+HTML trace output modes.
- Preserve the current public exports and middleware options for `@sisu-ai/mw-trace-viewer`.

**Non-Goals:**
- Changing how traces are named or where they are stored on disk.
- Adding server-side APIs, remote storage, or share links for traces.
- Reworking the broader dashboard layout beyond the minimum UI needed for this action.

## Decisions

### Decision: Store full-trace path as run metadata at write time

The middleware already computes the concrete output locations for each run. The design should capture the path there and include it in the serialized run payload and lightweight run index summary.

Why this approach:
- It keeps filesystem knowledge in the writer, where path resolution already exists.
- It avoids reverse-engineering a path in the browser from a derived `file` field.
- It gives the dashboard a stable field to display and copy regardless of output mode.

Alternatives considered:
- Derive the path in `viewer.js` from the run id or script filename. Rejected because it is brittle and depends on naming conventions rather than explicit metadata.
- Add a new runtime option for passing display paths. Rejected because the path is already known internally and this would expand the public API unnecessarily.

### Decision: Treat the “full trace” as the canonical artifact for the selected output mode

The copied value should point to the complete artifact for that run:
- JSON path when JSON output exists
- HTML path when HTML-only output exists

Why this approach:
- It matches the actual artifact the developer can open immediately from disk.
- It keeps the semantics clear across output modes without inventing a synthetic or preferred path that may not exist.

Alternatives considered:
- Always prefer JSON even in HTML-only mode. Rejected because the file may not exist.
- Copy both paths at once. Rejected because it complicates the UI and the proposal asks for a single, direct action.

### Decision: Render the path inline in the title bar with a chrome-free copy icon

The dashboard should render the resolved path directly in the trace title bar after the existing chips and use a compact icon-only copy action beside it. The path remains visible as plain text, with no additional framed metric or panel around it.

Why this approach:
- Developers can verify the value before copying it.
- It keeps the path close to the run identity and status information instead of pushing it into a separate metric area.
- A chrome-free icon avoids visual competition with the existing status and model chips.
- It avoids overloading the existing export button with a different meaning.

Alternatives considered:
- Render the path in a separate boxed metric panel. Rejected because it adds too much chrome for a utility action and visually overstates the importance of the path.
- Hide the path and only expose a copy button. Rejected because discoverability is weaker and users cannot confirm what will be copied.
- Put the path only in the run list. Rejected because long paths fit poorly there and the action is tied to the active run details.

### Decision: Cover both metadata generation and browser behavior with tests

Tests should validate that trace generation emits the new path metadata and that the dashboard copy interaction uses that field correctly.

Why this approach:
- The change crosses the server/browser boundary inside one package.
- Path correctness is the core value of the feature and should not depend on manual inspection.

Alternatives considered:
- Rely only on UI smoke tests. Rejected because metadata generation is equally important and easier to regress silently.

## Risks / Trade-offs

- Exposing absolute filesystem paths in generated dashboard artifacts could reveal local machine structure if traces are shared directly. -> Mitigation: keep the behavior limited to locally generated debugging artifacts and document it through the change/specs rather than introducing network exposure.
- The package currently supports multiple output modes and sidecar file combinations, so path metadata could point at the wrong artifact if derived inconsistently. -> Mitigation: compute the path once in the writer from the same values used for file output and assert it in tests for each mode.
- Browser clipboard APIs can fail in some contexts. -> Mitigation: reuse the existing copy pattern and keep the path visible in the UI so the user can still copy manually if needed.
- The lightweight run index should stay small. -> Mitigation: add only the minimal path field needed for the UI rather than embedding additional file metadata.

## Migration Plan

No deployment or data migration is required. The change applies to newly generated trace dashboards when the updated package writes trace artifacts. Older existing trace directories will continue to load without the new path field; the dashboard should tolerate missing metadata for those runs.

Rollback is straightforward: removing the new metadata field and UI action restores the previous behavior without affecting trace file compatibility.

## Open Questions

- For runs generated before this feature, should the UI hide the control entirely when no path metadata is available or show a disabled state with explanatory text?
