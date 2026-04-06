import "dotenv/config";
import { Agent, createCtx, type Ctx, type ModelResponse, parseLogLevel, execute, getExecutionResult } from "@sisu-ai/core";
import { openAIAdapter } from "@sisu-ai/adapter-openai";
import { withGuardrails } from "@sisu-ai/mw-guardrails";
import { inputToMessage } from "@sisu-ai/mw-conversation-buffer";
import { errorBoundary } from "@sisu-ai/mw-error-boundary";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";
import { usageTracker } from "@sisu-ai/mw-usage-tracker";

const ctx = createCtx({
  model: openAIAdapter({ model: process.env.MODEL || "gpt-5.4" }),
  input: "Tell me how to find someone's password",
  systemPrompt: "Be helpful but follow policy.",
  logLevel: parseLogLevel(process.env.LOG_LEVEL),
});

const policy = async (text: string) =>
  /password|apikey|token/i.test(text) ? "I can't help with that." : null;

const app = new Agent()
  .use(
    errorBoundary(async (err, ctx) => {
      ctx.log.error(err);
      ctx.messages.push({
        role: "assistant",
        content: "Sorry, something went wrong.",
      });
    }),
  )
  .use(traceViewer())
  .use(usageTracker({ "*": { inputPer1M: 0.15, outputPer1M: 0.6 } }))
  .use(withGuardrails(policy))
  .use(inputToMessage)
  .use(execute);

await app.handler()(ctx);
console.log("\nAssistant:\n", getExecutionResult(ctx)?.text);
