import "dotenv/config";
import { Agent, createCtx, type Ctx, type ModelResponse } from "@sisu-ai/core";
import { anthropicAdapter } from "@sisu-ai/adapter-anthropic";
import { registerTools } from "@sisu-ai/mw-register-tools";
import {
  inputToMessage,
  conversationBuffer,
} from "@sisu-ai/mw-conversation-buffer";
import { errorBoundary } from "@sisu-ai/mw-error-boundary";
import { toolCalling } from "@sisu-ai/mw-tool-calling";
import { switchCase, sequence, loopUntil } from "@sisu-ai/mw-control-flow";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";
import { usageTracker } from "@sisu-ai/mw-usage-tracker";
import { toolCallInvariant } from "@sisu-ai/mw-invariants";
import { z } from "zod";

const weather = {
  name: "getWeather",
  description: "Get weather for a city (demo stub)",
  schema: z.object({ city: z.string() }),
  handler: async ({ city }: { city: string }) => ({
    city,
    tempC: 20,
    summary: "Partly cloudy (stub)",
  }),
};

const ctx = createCtx({
  model: anthropicAdapter({ model: "claude-sonnet-4-20250514" }),
  input: "Weather in Malmö and suggest a fika plan.",
  systemPrompt: "Be helpful. Use tools when needed.",
  logLevel: process.env.LOG_LEVEL as
    | "debug"
    | "info"
    | "warn"
    | "error"
    | undefined,
});

const intentClassifier = async (c: Ctx, next: () => Promise<void>) => {
  const q = (c.input ?? "").toLowerCase();
  c.state.intent = /weather|forecast/.test(q) ? "tooling" : "chat";
  await next();
};
const decideIfMoreTools = async (c: Ctx, next: () => Promise<void>) => {
  const last = c.messages[c.messages.length - 1];
  const wasTool = last?.role === "tool";
  const turns = Number(c.state.turns ?? 0);
  c.state.moreTools = Boolean(wasTool && turns < 1);
  c.state.turns = turns + 1;
  await next();
};

const toolingBody = sequence([toolCalling, decideIfMoreTools]);
const toolingLoop = loopUntil((c) => !c.state.moreTools, toolingBody, {
  max: 6,
});
const chatPipeline = sequence([
  async (c) => {
    const res = (await c.model.generate(c.messages, {
      toolChoice: "none",
      signal: c.signal,
    })) as ModelResponse;
    if (res?.message) c.messages.push(res.message);
  },
]);

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
  .use(registerTools([weather]))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 12 }))
  .use(intentClassifier)
  .use(toolCallInvariant())
  .use(
    switchCase(
      (c) => String(c.state.intent),
      { tooling: toolingLoop, chat: chatPipeline },
      chatPipeline,
    ),
  );

await app.handler()(ctx, async () => {});
const final = ctx.messages.filter((m) => m.role === "assistant").pop();
console.log("\nAssistant:\n", final?.content);
