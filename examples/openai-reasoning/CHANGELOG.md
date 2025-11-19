# Changelog

## 0.1.2

### Patch Changes

- security: Remove API key partial logging from console output

  **Security Fix:**
  - Removed logging of API key's first 8 characters to prevent potential key exposure
  - Changed from `apiKey.substring(0, 8)...` to simple `✅ SET` / `❌ MISSING` indicator
  - Even partial API key exposure can be a security risk in logs, screenshots, or error reports

  **Impact:**
  - No behavioral changes to the example functionality
  - Improves security posture by eliminating unnecessary credential exposure
  - Maintains user-friendly feedback about API key configuration status

## 0.1.1

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @sisu-ai/adapter-openai@9.0.0
  - @sisu-ai/mw-trace-viewer@10.0.0
  - @sisu-ai/mw-usage-tracker@9.0.0
  - @sisu-ai/core@2.3.0

## [0.1.0] - 2025-11-19

### Added

- Initial OpenAI reasoning models example
- Support for o1, o3, and ChatGPT 5.1 reasoning models
- Multi-turn conversation with preserved reasoning context
- Usage tracking for reasoning model costs
- Trace visualization of reasoning flow
- Configuration for OpenRouter and OpenAI direct access
