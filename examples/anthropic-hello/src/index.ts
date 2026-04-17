import "dotenv/config";
import { Agent, createCtx, type Ctx, type ModelResponse, inputToMessage, parseLogLevel, execute, getExecutionResult } from "@sisu-ai/core";
import { usageTracker } from "@sisu-ai/mw-usage-tracker";
import { anthropicAdapter } from "@sisu-ai/adapter-anthropic";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";

const ctx = createCtx({
  model: anthropicAdapter({
    model: process.env.MODEL || "claude-sonnet-4-20250514",
  }),
  input: "Say hello in one short sentence.",
  systemPrompt: "You are a helpful assistant.",
  logLevel: parseLogLevel(process.env.LOG_LEVEL),
});

const app = new Agent()
  .use(async (c, next) => {
    try {
      await next();
    } catch (e) {
      c.log.error(e);
      c.messages.push({
        role: "assistant",
        content: "Sorry, something went wrong.",
      });
    }
  })
  .use(traceViewer())
  .use(
    usageTracker(
      { "*": { inputPer1M: 0.15, outputPer1M: 0.6 } },
      { logPerCall: true },
    ),
  )
  .use(inputToMessage)
  .use(execute);

await app.handler()(ctx);
console.log("\nAssistant:\n", getExecutionResult(ctx)?.text);
