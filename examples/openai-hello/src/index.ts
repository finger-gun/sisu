import "dotenv/config";
import { Agent, createCtx, type Ctx, type ModelResponse } from "@sisu-ai/core";
import { usageTracker } from "@sisu-ai/mw-usage-tracker";
import { openAIAdapter } from "@sisu-ai/adapter-openai";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";

const ctx = createCtx({
  model: openAIAdapter({ model: process.env.MODEL || "gpt-4o-mini" }),
  input: "Say hello in one short sentence.",
  systemPrompt: "You are a helpful assistant.",
  logLevel: process.env.LOG_LEVEL as
    | "debug"
    | "info"
    | "warn"
    | "error"
    | undefined,
});

const inputToMessage = async (c: Ctx, next: () => Promise<void>) => {
  if (c.input) c.messages.push({ role: "user", content: c.input });
  await next();
};
const generateOnce = async (c: Ctx) => {
  const res = (await c.model.generate(c.messages, {
    toolChoice: "none",
    signal: c.signal,
  })) as ModelResponse;
  if (res?.message) c.messages.push(res.message);
};

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
  .use(generateOnce);

await app.handler()(ctx);
const final = ctx.messages.filter((m) => m.role === "assistant").pop();
console.log("\nAssistant:\n", final?.content);
