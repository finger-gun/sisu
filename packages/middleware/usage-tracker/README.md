# @sisu-ai/mw-usage-tracker

Track token usage across your pipeline and estimate cost.

## Setup
```bash
npm i @sisu-ai/mw-usage-tracker
```

## Documentation
Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu

## Usage
```ts
import { usageTracker } from '@sisu-ai/mw-usage-tracker';

const app = new Agent()
  .use(usageTracker({
    'openai:gpt-4o-mini': {
      // Preferred: prices per 1M tokens (matches provider docs)
      inputPer1M: 0.15,
      outputPer1M: 0.60,
      // Optional vision pricing (choose one):
      // a) Per 1K images (e.g., $0.217/K images)
      imagePer1K: 0.217,
      // b) Approximate per-1K "image tokens"
      // imageInputPer1K: 0.217,
      // imageTokenPerImage: 1000,
    },
    // Fallback default for other models
    '*': { inputPer1M: 0.15, outputPer1M: 0.60 },
  }, { logPerCall: true }))
```

## How it works
- Wraps `ctx.model.generate` for the duration of the pipeline.
- Accumulates `promptTokens`, `completionTokens`, `totalTokens` from `ModelResponse.usage`.
- If a price table is provided, computes `costUSD` per call and totals.
- Optional: for vision models
  - Providers vary: some include image cost in native token usage; others bill separately per image.
  - If billed per image batch, set `imagePer1K` (e.g., 0.217 USD per 1K images). The tracker converts this to per-image.
  - Or configure `imageInputPer1K` + `imageTokenPerImage` to approximate per-1K image-token pricing. In that mode we split
    prompt tokens into estimated `imageTokens = imageCount * imageTokenPerImage` (default 1000) and
    `textPromptTokens = promptTokens - imageTokens`, then price them separately.
- Writes totals to `ctx.state.usage` and logs them at the end.
- Cost is rounded to 6 decimals to avoid showing small calls as 0.00.

## Notes
- Each adapter should map its native usage fields to `ModelResponse.usage`.
- If a provider doesn’t return usage, you’ll get counts of calls only (no cost).
- Image cost estimation is an approximation unless your adapter returns precise image token usage.

# Community & Support
- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
