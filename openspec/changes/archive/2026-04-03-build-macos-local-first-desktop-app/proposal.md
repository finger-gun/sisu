## Why

Sisu has strong model and provider support, but there is no first-party desktop product that showcases that power with a premium end-user experience. Building a macOS-first, local-first app now creates a flagship surface for streaming chat, multimodal workflows, and provider portability while the framework is already mature.

## What Changes

- Introduce a macOS desktop product direction based on a native SwiftUI client and a bundled local Sisu runtime process.
- Define product requirements for a ChatGPT-class UX: streaming responses, image-aware chat, fast provider/model switching, and resilient long-running sessions.
- Define conversation workflows for history, search, and branching from any prior message into a new thread.
- Define runtime contracts for local orchestration of Ollama, OpenAI, and Anthropic with unified capability metadata.
- Define observability and recovery expectations so failures are visible, actionable, and restart-safe.

### Goals

- Deliver a macOS-first, local-first AI chat experience with lower latency and higher UX quality than existing local-model desktop tools.
- Preserve Sisu's provider-agnostic architecture while exposing it through a product-ready local runtime API.
- Establish a protocol and domain model that can be reused by future iPad/iPhone clients.

### Non-goals

- iOS/iPadOS local model runtime in this change.
- New cloud-hosted orchestration services.
- Broad changes to existing framework middleware behavior unrelated to desktop runtime/product requirements.

## Capabilities

### New Capabilities

- `desktop-runtime-hosting`: Local desktop runtime process lifecycle, health, streaming transport, and localhost security boundaries.
- `desktop-chat-experience`: Real-time chat experience requirements including token streaming, multimodal/image message support, and cancellation/retry behavior.
- `desktop-conversation-management`: Conversation persistence requirements including history, full-text search, and branch-from-message workflows.
- `desktop-provider-model-management`: Unified provider/model discovery, capability display, defaults, and per-chat overrides.
- `desktop-observability-recovery`: User-visible trace/log surfaces and crash/restart recovery requirements for desktop runtime sessions.

### Modified Capabilities

- None.

## Impact

- **Target audience**: AI developers, local-model enthusiasts, and power users who want a high-quality native macOS chat client with transparent model control.
- **Intended use cases**: daily assistant chat, local/private model workflows with Ollama, provider comparison across OpenAI/Anthropic/local models, and long-lived project conversations with searchable history.
- **User-facing changes**: new desktop app experience with streaming chat UI, image message rendering, provider/model switching, conversation history search, and branch chat actions.
- **API surface changes**: new local runtime protocol for desktop clients (HTTP + streaming channel), plus standardized model capability metadata and conversation/branch APIs.
- **Code/system impact**: new app workspace(s), new runtime package(s), protocol definitions shared across runtime and clients, plus persistence/indexing and observability subsystems.

## Success Metrics

- First token render time and stream smoothness meet desktop UX targets in local and hosted-provider modes.
- Users can complete core flows (new chat, switch model, attach image, search history, branch conversation) without restarting the app.
- Runtime process health and recovery behavior is deterministic and diagnosable via logs/traces.

## Acceptance Criteria

- Proposal-aligned specs exist for all listed capabilities with testable requirements.
- `apply.requires` artifacts are complete and implementation can begin without unresolved product-scope ambiguity.
- User-facing and API-surface expectations are explicitly documented for runtime and client integration.
