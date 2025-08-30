# @sisu/mw-usage-tracker

Track token usage across your pipeline and estimate cost.

## Usage
```ts
import { usageTracker } from '@sisu/mw-usage-tracker';

const app = new Agent()
  .use(usageTracker({
    'openai:gpt-4o-mini': { inputPer1K: 0.15, outputPer1K: 0.6 },
    '*': { inputPer1K: 0.15, outputPer1K: 0.6 },
  }, { logPerCall: true }))
```

## How it works
- Wraps `ctx.model.generate` for the duration of the pipeline.
- Accumulates `promptTokens`, `completionTokens`, `totalTokens` from `ModelResponse.usage`.
- If a price table is provided, computes `costUSD` per call and totals.
- Writes totals to `ctx.state.usage` and logs them at the end.

## Notes
- Each adapter should map its native usage fields to `ModelResponse.usage`.
- If a provider doesn’t return usage, you’ll get counts of calls only (no cost).

