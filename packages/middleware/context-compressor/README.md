# @sisu-ai/mw-context-compressor

Middleware that compresses long conversation context using the model itself.

- Wraps `ctx.model.generate` to summarize older messages when the context grows beyond a size threshold.
- Preserves the last `keepRecent` messages unmodified.
- Keeps essential facts and URLs; emits a compact assistant summary message that replaces older history.

## Usage
```ts
import { contextCompressor } from '@sisu-ai/mw-context-compressor';

agent.use(contextCompressor({ maxChars: 200_000, keepRecent: 8, summaryMaxChars: 12_000 }));
```

## Options
- `maxChars` (default 200k): approximate character budget before compressing.
- `keepRecent` (default 8): number of most recent messages to retain verbatim.
- `summaryMaxChars` (default 12k): target maximum size of the generated summary message.

Note: This is a best-effort char-based heuristic; exact token accounting varies by model.
