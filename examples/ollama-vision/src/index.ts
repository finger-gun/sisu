import "dotenv/config";
import { Agent, createCtx, type Ctx, type ModelResponse, parseLogLevel, execute, getExecutionResult } from "@sisu-ai/core";
import { usageTracker } from "@sisu-ai/mw-usage-tracker";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";
import { ollamaAdapter } from "@sisu-ai/adapter-ollama";


const imageUrl =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Wall_climbing_place_v%C3%A4stra_kullaberg.jpg/1920px-Wall_climbing_place_v%C3%A4stra_kullaberg.jpg";

const userMessage = {
  role: "user",
  content: [
    { type: "text", text: "Please describe this image." },
    { type: "image_url", image_url: { url: imageUrl } },
  ],
} as unknown as Ctx["messages"][number];

const ctx = createCtx({
  model: ollamaAdapter({ model: process.env.MODEL || "gemma4:e4b" }),
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
  // Local models, so set costs to zero
  .use(
    usageTracker(
      { "*": { inputPer1K: 0, outputPer1K: 0, imagePer1K: 0 } },
      { logPerCall: true },
    ),
  )
  .use(execute);

await app.handler()(ctx);
console.log("\nAssistant:\n", getExecutionResult(ctx)?.text);
