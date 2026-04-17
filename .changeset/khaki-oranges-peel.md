---
"@sisu-ai/core": patch
"@sisu-ai/cli": patch
"@sisu-ai/server": patch
---

Refresh documentation and skill guidance links to improve discoverability and onboarding.

This adds the official website reference and updates Sisu skill docs with clearer CLI fallback guidance, including the agent-friendly documentation page.

Also improves `@sisu-ai/server` type compatibility by accepting an agent runner interface in the server constructor, avoiding duplicate-module private-field type conflicts in workspace example builds.
