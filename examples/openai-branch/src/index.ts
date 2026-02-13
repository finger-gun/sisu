import "dotenv/config";
import { Agent, createCtx, type Ctx, type ModelResponse } from "@sisu-ai/core";
import { openAIAdapter } from "@sisu-ai/adapter-openai";
import { inputToMessage } from "@sisu-ai/mw-conversation-buffer";
import { errorBoundary } from "@sisu-ai/mw-error-boundary";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";
import { usageTracker } from "@sisu-ai/mw-usage-tracker";
import { branch, sequence } from "@sisu-ai/mw-control-flow";

const ctx = createCtx({
  model: openAIAdapter({ model: process.env.MODEL || "gpt-4o-mini" }),
  input: "Tell me a joke about cats.",
  systemPrompt: "Be helpful and concise.",
  logLevel: process.env.LOG_LEVEL as
    | "debug"
    | "info"
    | "warn"
    | "error"
    | undefined,
});

// Branch: if input mentions joke/humor → use a playful prompt, else → practical advice prompt
const playful = sequence([
  async (c: Ctx) => {
    c.messages.push({
      role: "system",
      content: "You are a witty comedian. Answer with one short, clever joke.",
    });
    const res = (await c.model.generate(c.messages, {
      toolChoice: "none",
      signal: c.signal,
    })) as ModelResponse;
    if (res?.message) c.messages.push(res.message);
  },
]);

const practical = sequence([
  async (c: Ctx) => {
    c.messages.push({
      role: "system",
      content:
        "You are a pragmatic assistant. Give a succinct, actionable suggestion.",
    });
    const res = (await c.model.generate(c.messages, {
      toolChoice: "none",
      signal: c.signal,
    })) as ModelResponse;
    if (res?.message) c.messages.push(res.message);
  },
]);

const app = new Agent()
  .use(
    errorBoundary(async (err, c) => {
      c.log.error(err);
      c.messages.push({
        role: "assistant",
        content: "Sorry, something went wrong.",
      });
    }),
  )
  .use(traceViewer())
  .use(usageTracker({ "*": { inputPer1M: 0.15, outputPer1M: 0.6 } }))
  .use(inputToMessage)
  .use(
    branch<Ctx>(
      (c) => /joke|funny|humor/i.test(c.input ?? ""),
      playful,
      practical,
    ),
  );

await app.handler()(ctx);
const final = ctx.messages.filter((m) => m.role === "assistant").pop();
console.log("\nAssistant:\n", final?.content);
