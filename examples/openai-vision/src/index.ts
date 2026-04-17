import "dotenv/config";
import { Agent, createCtx, type Ctx, type ModelResponse, parseLogLevel, execute, getExecutionResult } from "@sisu-ai/core";
import { usageTracker } from "@sisu-ai/mw-usage-tracker";
import { openAIAdapter } from "@sisu-ai/adapter-openai";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";

// Vision-capable model
// Example image (public domain)
const imageUrl =
  process.argv.find((a) => a.startsWith("http")) ||
  "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Wall_climbing_place_v%C3%A4stra_kullaberg.jpg/1920px-Wall_climbing_place_v%C3%A4stra_kullaberg.jpg";

// Use content parts to include text + image
const userMessage = {
  role: "user",
  content: [
    { type: "text", text: "Please describe this image." },
    { type: "image_url", image_url: { url: imageUrl } },
  ],
} as unknown as Ctx["messages"][number];

const ctx = createCtx({
  model: openAIAdapter({ model: process.env.MODEL || "gpt-5.4" }),
  systemPrompt: "You are a concise, helpful assistant.",
  logLevel: parseLogLevel(process.env.LOG_LEVEL),
  tools: {
    list: () => [],
    get: () => undefined,
    register: () => {
      /* no-op */
    },
  },
});

// Add the user message with image after context creation
ctx.messages.push(userMessage);

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
      {
        "*": { inputPer1M: 0.15, outputPer1M: 0.6, imagePer1K: 0.217 },
      },
      { logPerCall: true },
    ),
  )
  .use(execute);

await app.handler()(ctx);
console.log("\nAssistant:\n", getExecutionResult(ctx)?.text);
