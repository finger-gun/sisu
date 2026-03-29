## Context

Sisu currently supports vision-oriented message inputs in OpenAI and Ollama paths, but Anthropic adapter mapping still treats user content as text-only unless it is tool-related. This creates provider inconsistency for multimodal agent workflows and forces Anthropic users to build custom mapping logic outside the adapter.

The existing Anthropic adapter already has mature retry, timeout, tool-calling, and streaming behavior. This change should extend input mapping for vision while preserving those behaviors and keeping the public API additive.

## Goals / Non-Goals

**Goals:**
- Add Anthropic vision request mapping that accepts text + image inputs using the same message authoring patterns used elsewhere in Sisu.
- Keep adapter behavior explicit and deterministic: normalize inputs, validate image payloads, and emit clear errors.
- Preserve compatibility for existing text-only and tool-calling Anthropic usage.
- Add a runnable Anthropic vision example and tests that prove multimodal mapping works.

**Non-Goals:**
- Introduce new cross-provider core message abstractions in this change.
- Add audio/video multimodal support.
- Add provider-specific OCR or post-processing utilities.

## Decisions

### Decision 1: Reuse the existing rich-content input shape used by other adapters
Anthropic vision mapping will accept the same high-level input styles already supported in Sisu examples/adapters:
- `content` as parts array with `{ type: "text" }` and image entries
- `contentParts` alias
- convenience image fields (`image`, `image_url`, `images`, `image_urls`)

**Rationale:** This provides provider parity and avoids asking users to learn adapter-specific message construction for vision.

**Alternative considered:** Create a new Anthropic-only message field contract.  
**Rejected because:** It introduces avoidable API divergence and higher migration/documentation burden.

### Decision 2: Normalize image sources into Anthropic-compatible image content blocks
The adapter will map image inputs into Anthropic `image` content blocks with a valid `source` payload while preserving adjacent text blocks order.

Supported source forms will include:
- data URLs
- raw base64 image strings
- remote URLs (converted to an accepted source payload format before request send)

**Rationale:** Users commonly provide URLs in examples; normalization keeps ergonomics high while producing valid Anthropic payloads.

**Alternative considered:** Only accept base64 and reject URLs.  
**Rejected because:** It creates an unnecessary usability gap versus OpenAI/Ollama examples and increases integration friction.

### Decision 3: Keep tool-calling semantics unchanged and additive
Vision support modifies only message-content normalization for user/assistant text+image inputs. Existing `tool_use` and `tool_result` mappings remain unchanged.

**Rationale:** Tooling behavior is already tested and stable; vision should not regress function-calling workflows.

**Alternative considered:** Refactor tool and vision mapping together.  
**Rejected because:** It increases risk and makes regressions harder to isolate.

### Decision 4: Enforce explicit failure and cancellation propagation
Image normalization failures (invalid source format, failed URL retrieval, unsupported media type) will throw actionable `Error`s. Cancellation via `AbortSignal` will be respected across any image fetch and request stages.

**Rationale:** This aligns with repository standards (no silent fallback) and keeps runtime behavior predictable under failure/cancellation.

**Alternative considered:** Soft-skip invalid images and continue with text-only fallback.  
**Rejected because:** Silent degradation hides user mistakes and makes multimodal behavior nondeterministic.

### Decision 5: Ship parity artifacts (tests, docs, example) together
The implementation includes:
- Anthropic adapter unit tests for multimodal mapping and invalid image input behavior
- A runnable `anthropic-vision` example
- Anthropic adapter README updates describing vision inputs and constraints

**Rationale:** Provider capability changes are incomplete without discoverable usage guidance and verification coverage.

## Data Flow and Integration Points

1. Caller provides a `Message` containing text and one or more image descriptors.
2. Anthropic adapter normalizes the message into Anthropic content blocks (`text`, `image`, existing tool blocks as applicable).
3. For URL-based images, adapter resolves source payload before API request (with cancellation support).
4. Adapter posts to Anthropic Messages API unchanged in retry/timeout behavior.
5. Response mapping (`text`, `tool_use`, usage) remains unchanged.

**Integration points:**
- `packages/adapters/anthropic/src/index.ts` (message mapping and payload construction)
- `packages/adapters/anthropic/test/anthropic.test.ts` (new multimodal tests)
- `examples/anthropic-vision/*` (new runnable example)
- `packages/adapters/anthropic/README.md` (vision usage docs)

**Expected public exports:**
- No required breaking export changes.
- Existing `anthropicAdapter` export gains additive multimodal input handling.

## Risks / Trade-offs

- **[Risk] URL-to-image normalization introduces network dependency before request send**  
  → **Mitigation:** Enforce timeout/cancellation wiring and surface explicit fetch errors.

- **[Risk] Payload format mismatch with Anthropic image source requirements**  
  → **Mitigation:** Add unit tests that assert exact request body shape and media metadata behavior.

- **[Risk] Regressions in existing text/tool flows during mapper changes**  
  → **Mitigation:** Keep tool-mapping path isolated and run existing adapter tests plus targeted multimodal tests.

- **[Trade-off] More normalization logic increases adapter complexity**  
  → **Mitigation:** Keep mapping helpers focused and typed; avoid cross-cutting refactors in this change.

## Migration Plan

1. Implement additive message normalization changes in the Anthropic adapter.
2. Add tests for multimodal happy paths and validation failures.
3. Add `anthropic-vision` example and update adapter docs.
4. Run repository lint/build/test gates.
5. Rollback strategy: revert adapter mapping additions and remove example/docs changes (text/tool behavior remains intact).

## Open Questions

- None for this change.

## Resolved Decisions

- MIME-type allowlisting will not be added in v1. We will rely on Anthropic API validation for unsupported formats and surface provider errors directly.
- A URL-fetch on/off adapter option will not be added. URL-based image inputs are expected to use fetch behavior by default in this online-provider context.
