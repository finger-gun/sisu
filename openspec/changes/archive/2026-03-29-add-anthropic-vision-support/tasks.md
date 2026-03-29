## 1. Anthropic multimodal mapping implementation

- [x] 1.1 Extend `packages/adapters/anthropic/src/index.ts` content block types to support Anthropic image blocks in addition to existing text/tool blocks.
- [x] 1.2 Implement message normalization helpers in `packages/adapters/anthropic/src/index.ts` that accept `content`, `contentParts`, and convenience fields (`image`, `image_url`, `images`, `image_urls`) for user messages.
- [x] 1.3 Map normalized image inputs to Anthropic Messages API-compatible image `source` payloads while preserving text/image block order.
- [x] 1.4 Ensure existing assistant tool-call and tool-result mappings remain unchanged in `toAnthropicMessage` for mixed tool + vision conversations.

## 2. Validation, error handling, and cancellation

- [x] 2.1 Add explicit validation for unsupported/invalid image sources in `packages/adapters/anthropic/src/index.ts` and throw actionable `Error` messages.
- [x] 2.2 Implement remote image retrieval normalization logic with deterministic failure behavior (no silent fallback to text-only).
- [x] 2.3 Propagate cancellation signals through image normalization/retrieval paths and preserve current request timeout/retry behavior.

## 3. Tests for Anthropic vision behavior

- [x] 3.1 Add unit tests in `packages/adapters/anthropic/test/anthropic.test.ts` for text+image content parts mapping to expected Anthropic request body blocks.
- [x] 3.2 Add unit tests in `packages/adapters/anthropic/test/anthropic.test.ts` for convenience image fields normalization.
- [x] 3.3 Add unit tests in `packages/adapters/anthropic/test/anthropic.test.ts` for invalid image input and image retrieval failure error paths.
- [x] 3.4 Add regression tests in `packages/adapters/anthropic/test/anthropic.test.ts` confirming text-only and tool-calling behavior remains unchanged with vision support.

## 4. Example and documentation updates

- [x] 4.1 Create `examples/anthropic-vision/` with runnable `src/index.ts`, package metadata, and README mirroring existing vision example patterns.
- [x] 4.2 Update provider/example listings in relevant docs to include the new Anthropic vision example.
- [x] 4.3 Update `packages/adapters/anthropic/README.md` with a vision usage section describing supported image input forms and constraints.

## 5. Validation and quality gates

- [x] 5.1 Run targeted adapter tests: `pnpm --filter @sisu-ai/adapter-anthropic test`.
- [x] 5.2 Run repository lint: `pnpm lint`.
- [x] 5.3 Run repository build: `pnpm build`.
- [x] 5.4 Run repository tests: `pnpm test`.
