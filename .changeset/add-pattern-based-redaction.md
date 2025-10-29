---
'@sisu-ai/core': minor
---

Add pattern-based sensitive data detection to redaction logger

Enhanced the redaction logger with regex pattern matching to detect and redact common sensitive data formats like API keys, tokens, and secrets - even when they're not stored under known key names. The feature includes:

- New `patterns` option in `RedactOptions` to specify custom regex patterns
- Default patterns for detecting:
  - OpenAI-style API keys (sk-...)
  - JWT tokens
  - GitHub Personal Access Tokens
  - GitHub OAuth tokens
  - GitLab Personal Access Tokens
  - Google API keys
  - Google OAuth tokens
  - AWS Access Key IDs
  - Slack tokens
- String values matching patterns are automatically redacted regardless of their key name
- Backwards compatible - existing key-based redaction still works
- Custom patterns can be provided to detect domain-specific sensitive data