# Error Types Implementation

This document describes the structured error types implemented in Sisu to improve debugging and error handling.

## Overview

All Sisu errors extend the `SisuError` base class, which provides:
- **code**: Machine-readable error code (e.g., `'TOOL_EXECUTION_ERROR'`)
- **message**: Human-readable error description
- **context**: Additional structured data about the error
- **toJSON()**: Serialization method for logging and tracing

## Error Classes

### SisuError
Base error class for all Sisu errors.

```typescript
new SisuError(message: string, code: string, context?: unknown)
```

### MiddlewareError
Thrown when middleware execution fails. Includes the middleware index to help identify which middleware failed.

```typescript
new MiddlewareError(message: string, middlewareIndex: number, cause?: Error)
```

**Example:**
```typescript
throw new MiddlewareError('Middleware chain failed', 2, originalError);
```

### ToolExecutionError
Thrown when tool execution fails. Includes tool name and arguments for debugging.

```typescript
new ToolExecutionError(message: string, toolName: string, args: unknown, cause?: Error)
```

**Example:**
```typescript
throw new ToolExecutionError('Failed to fetch data', 'getWeather', { city: 'Stockholm' }, err);
```

### AdapterError
Thrown when adapter/LLM operations fail. Includes model name and provider-specific details.

```typescript
new AdapterError(message: string, modelName: string, provider?: string, cause?: Error)
```

**Example:**
```typescript
throw new AdapterError('API rate limit exceeded', 'gpt-4', 'openai', err);
```

### ValidationError
Thrown when validation fails (e.g., schema validation for tools). Includes validation errors and the data that failed validation.

```typescript
new ValidationError(message: string, validationErrors: unknown, data?: unknown, cause?: Error)
```

**Example:**
```typescript
const result = schema.safeParse(input);
if (!result.success) {
  throw new ValidationError('Invalid arguments', result.error.errors, input);
}
```

### TimeoutError
Thrown when operations timeout. Includes timeout duration and operation details.

```typescript
new TimeoutError(message: string, timeoutMs: number, operation?: string, cause?: Error)
```

**Example:**
```typescript
throw new TimeoutError('Operation timed out', 5000, 'fetchData');
```

### CancellationError
Thrown when operations are cancelled (e.g., via AbortSignal). Includes the reason for cancellation if available.

```typescript
new CancellationError(message: string, reason?: string, cause?: Error)
```

**Example:**
```typescript
if (signal.aborted) {
  throw new CancellationError('Request cancelled', 'user_abort');
}
```

### ConfigurationError
Thrown when configuration is invalid. Includes the invalid configuration and expected format.

```typescript
new ConfigurationError(message: string, config?: unknown, expected?: string, cause?: Error)
```

**Example:**
```typescript
if (!apiKey) {
  throw new ConfigurationError(
    'API key is required',
    { apiKey },
    'apiKey must be a non-empty string'
  );
}
```

## Helper Functions

### isSisuError()
Type guard to check if an error is a SisuError instance.

```typescript
function isSisuError(error: unknown): error is SisuError
```

**Example:**
```typescript
if (isSisuError(err)) {
  console.error('Sisu error:', err.code, err.context);
}
```

### getErrorDetails()
Extract structured error details for logging from any error type.

```typescript
function getErrorDetails(error: unknown): {
  name: string;
  message: string;
  code?: string;
  context?: unknown;
  stack?: string;
}
```

**Example:**
```typescript
try {
  await processRequest();
} catch (err) {
  const details = getErrorDetails(err);
  logger.error('Request failed:', details);
}
```

## Integration

### Error Boundary Middleware
The error-boundary middleware automatically logs structured error details:

```typescript
import { errorBoundary, logErrors } from '@sisu-ai/mw-error-boundary';

// Custom error handler
agent.use(errorBoundary(async (err, ctx) => {
  const details = getErrorDetails(err);
  ctx.log.error('Error:', details);
  // Handle error...
}));

// Simple logging
agent.use(logErrors());
```

### Trace Viewer
The trace viewer automatically captures and displays structured error information in the HTML trace:

- Error name and code (e.g., `ToolExecutionError [TOOL_EXECUTION_ERROR]`)
- Error message
- Structured context (tool name, arguments, etc.)
- Full stack trace (collapsible)

## Testing

Comprehensive tests are located in `packages/core/test/errors.test.ts` with 100% coverage of the error types module.

Run tests:
```bash
npm run test:coverage -- packages/core/test/errors.test.ts
```

## Best Practices

1. **Use specific error types**: Choose the most appropriate error class for the situation
2. **Include context**: Provide relevant context data to aid debugging
3. **Chain errors**: Pass the original error as `cause` when wrapping errors
4. **Log structured data**: Use `getErrorDetails()` or `toJSON()` for logging
5. **Handle gracefully**: Catch and handle errors appropriately in middleware

## Migration Guide

If you have existing error handling code:

**Before:**
```typescript
throw new Error('Tool failed');
```

**After:**
```typescript
import { ToolExecutionError } from '@sisu-ai/core';

throw new ToolExecutionError('Tool failed', toolName, args, originalError);
```

This provides much better debugging information and integrates seamlessly with Sisu's tracing and logging infrastructure.