---
"@sisu-ai/adapter-openai": patch
"@sisu-ai/adapter-anthropic": patch
"@sisu-ai/adapter-ollama": patch
---

Improve adapter reliability by migrating provider transport internals to official SDK clients while preserving existing Sisu adapter APIs.

This update includes better request/response normalization consistency, stronger streaming and tool-calling conformance coverage, improved cancellation handling, and updated adapter migration notes.
