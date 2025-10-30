---
"@sisu-ai/core": minor
"@sisu-ai/mw-error-boundary": minor
"@sisu-ai/mw-trace-viewer": patch
---

Add structured error types and enhanced error display

**@sisu-ai/core:**
- Add comprehensive error type hierarchy with SisuError base class
- Add MiddlewareError, ToolExecutionError, AdapterError, ValidationError, TimeoutError, CancellationError, and ConfigurationError
- Add isSisuError() type guard and getErrorDetails() helper
- Export all error types from core package
- Add complete documentation in ERROR_TYPES.md

**@sisu-ai/mw-error-boundary:**
- Enhance to automatically log structured error details using getErrorDetails()
- Save error details to ctx.state._error for trace viewer integration
- Add logErrors() and logAndRethrow() convenience middleware

**@sisu-ai/mw-trace-viewer:**
- Capture error details in trace metadata and run objects
- Inject error events into trace timeline for visibility
- Add prominent error display box in viewer UI with pipeline context
- Show which middleware failed (extracted from stack trace)
- Display recent events before error for context
- Include collapsible error details with context and stack trace
- Support both light and dark themes
- Enhance standalone HTML traces with error boxes