import "dotenv/config";
import { Agent, createCtx, type Ctx, type ModelResponse, inputToMessage, parseLogLevel } from "@sisu-ai/core";
import { usageTracker } from "@sisu-ai/mw-usage-tracker";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";
import { ollamaAdapter } from "@sisu-ai/adapter-ollama";

const ctx = createCtx({
  model: ollamaAdapter({ model: process.env.MODEL || "gemma4:e4b" }),
  input: "Say hello in one short sentence.",
  systemPrompt: "You are a helpful assistant.",
  logLevel: parseLogLevel(process.env.LOG_LEVEL),
});

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
      { "*": { inputPer1K: 0, outputPer1K: 0 } },
      { logPerCall: true },
    ),
  )
  .use(inputToMessage)
  .use(generateOnce);

await app.handler()(ctx);
const final = ctx.messages.filter((m) => m.role === "assistant").pop();
console.log("\nAssistant:\n", final?.content);
