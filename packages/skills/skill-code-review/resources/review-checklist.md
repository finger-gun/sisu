# Code Review Checklist

## Correctness

- Inputs validated and schema enforced
- Edge cases handled (empty data, nulls, malformed input)
- Error messages are actionable and consistent

## Safety & Security

- No direct shell execution without validation
- No secrets logged or stored in outputs
- File paths sanitized and constrained

## Performance

- No unnecessary O(n^2) loops on hot paths
- I/O operations are bounded and cached when appropriate
- Avoid large in-memory buffers for streaming data

## Type Safety

- No `any` usage in public APIs
- Narrowed `unknown` where needed
- Zod schemas align with runtime behavior

## Observability

- Logs use ctx.log; no console.\*
- Errors include context and cause
- Tracing hooks preserved
