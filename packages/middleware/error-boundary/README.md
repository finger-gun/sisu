# @sisu/mw-error-boundary

Catch exceptions and render a fallback.

## API
- `errorBoundary(onError)` — wraps the downstream pipeline in a try/catch and calls your `onError(err, ctx, next)`.

## Usage
```ts
import { errorBoundary } from '@sisu/mw-error-boundary';

const app = new Agent()
  .use(errorBoundary(async (err, ctx) => {
    ctx.log.error(err);
    ctx.messages.push({ role: 'assistant', content: 'Sorry, something went wrong.' });
  }))
  // ...rest
```
