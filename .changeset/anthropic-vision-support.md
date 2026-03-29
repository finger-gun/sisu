---
"@sisu-ai/adapter-anthropic": minor
---

Add vision input support to the Anthropic adapter.

You can now send mixed text + image user messages using content parts and convenience image fields (`content`/`contentParts`, `image_url`, `image`, `images`, `image_urls`). The adapter normalizes image inputs (data URLs, base64, and remote URLs) into Anthropic-compatible image blocks while preserving existing tool-calling and text-only behavior.

This is an additive feature with no required migration changes.
