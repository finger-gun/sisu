# Error Handling Example

This example demonstrates Sisu's structured error types and error handling capabilities.

## Features

- **Structured Error Types**: Shows different error classes (ToolExecutionError, ValidationError, ConfigurationError, TimeoutError)
- **Error Boundary Middleware**: Graceful error handling with custom error handlers
- **Error Context Preservation**: How error context flows through the middleware stack
- **Trace Viewer Integration**: Error details displayed in HTML traces

## Error Types Demonstrated

1. **ToolExecutionError** - When a tool fails during execution
2. **ValidationError** - When schema validation fails
3. **ConfigurationError** - When required configuration is missing
4. **TimeoutError** - When operations exceed timeout limits

## Setup

```bash
# Install dependencies
npm install

# Create .env file with your OpenAI API key
cp .env.example .env
```

## Usage

Run different error scenarios:

```bash
# From the example directory
cd examples/openai-error-handling

# Success scenario (no errors)
npm run dev success

# Tool execution error (city not found)
npm run dev execution

# Configuration error (missing API key)
npm run dev config

# Timeout error (operation too slow)
npm run dev timeout

# Run all scenarios
npm run dev

# Or run from the project root
npm run ex:openai:error-handling
```

## What to Observe

1. **Console Output**: Structured error details printed by the error boundary
2. **Trace Files**: Check `traces/` directory for HTML traces showing error context
3. **Error Recovery**: How the agent handles errors gracefully

## Example Output

When a ToolExecutionError occurs:

```
=== Error Caught by Error Boundary ===
Name: ToolExecutionError
Message: Failed to fetch weather: City not found
Code: TOOL_EXECUTION_ERROR
Context: {
  "toolName": "fetchWeather",
  "args": { "city": "Nowhere" },
  "cause": { ... }
}
This is a structured Sisu error
======================================
```

## Trace Viewer

The trace viewer captures all error information:

- Error name and code
- Error message  
- Full context (tool name, arguments, cause)
- Stack trace
- Timeline of events leading to the error

Open `traces/viewer.html` to browse all traces in a web interface.

## Key Code Patterns

### Throwing Structured Errors

```typescript
throw new ToolExecutionError(
  'Failed to fetch data',
  'fetchWeather',
  { city: 'Stockholm' },
  originalError
);
```

### Custom Error Handler

```typescript
const customErrorHandler = errorBoundary(async (err, ctx) => {
  const details = getErrorDetails(err);
  
  if (isSisuError(err)) {
    console.log('Sisu error:', err.code, err.context);
  }
  
  // Add recovery message
  ctx.messages.push({
    role: 'assistant',
    content: `Error: ${details.message}`
  });
});
```

### Type-Safe Error Checking

```typescript
if (isSisuError(err)) {
  // TypeScript knows err is SisuError here
  console.log(err.code, err.context);
}
```

## Learn More

- [Error Types Documentation](../../packages/core/ERROR_TYPES.md)
- [Core Package README](../../packages/core/README.md)
- [Error Boundary Middleware](../../packages/middleware/error-boundary/)