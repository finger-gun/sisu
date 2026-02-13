import "dotenv/config";
import { Agent, createCtx, type Ctx, type ModelResponse } from "@sisu-ai/core";
import { usageTracker } from "@sisu-ai/mw-usage-tracker";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";
import { ollamaAdapter } from "@sisu-ai/adapter-ollama";

// Vision-capable model (ensure pulled locally)
// Examples: `llava:latest`, `qwen2.5-vl:latest` (model availability may vary)
// Example image (public domain) or first CLI arg
const imageUrl =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg";

// Use content parts to include text + image (adapter maps to images[] and auto-fetches URL → base64)
const userMessage = {
  role: "user",
  content: [
    { type: "text", text: "Please describe this image." },
    { type: "image_url", image_url: { url: imageUrl } },
  ],
} as unknown as Ctx["messages"][number];

const ctx = createCtx({
  model: ollamaAdapter({ model: process.env.MODEL || "llava:latest" }),
  systemPrompt: "You are a concise, helpful assistant.",
  logLevel: process.env.LOG_LEVEL as
    | "debug"
    | "info"
    | "warn"
    | "error"
    | undefined,
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
  // Local models, so set costs to zero
  .use(
    usageTracker(
      { "*": { inputPer1K: 0, outputPer1K: 0, imagePer1K: 0 } },
      { logPerCall: true },
    ),
  )
  .use(generateOnce);

await app.handler()(ctx);
const final = ctx.messages.filter((m) => m.role === "assistant").pop();
console.log("\nAssistant:\n", final?.content);
