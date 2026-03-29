import "dotenv/config";
import { Agent, createCtx, type Ctx, type ModelResponse } from "@sisu-ai/core";
import { usageTracker } from "@sisu-ai/mw-usage-tracker";
import { anthropicAdapter } from "@sisu-ai/adapter-anthropic";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";

const imageUrl =
  process.argv.find((a) => a.startsWith("http")) ||
  "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Wall_climbing_place_v%C3%A4stra_kullaberg.jpg/1920px-Wall_climbing_place_v%C3%A4stra_kullaberg.jpg";

const userMessage = {
  role: "user",
  content: [
    { type: "text", text: "Please describe this image." },
    { type: "image_url", image_url: { url: imageUrl } },
  ],
} as unknown as Ctx["messages"][number];

const ctx = createCtx({
  model: anthropicAdapter({
    model: process.env.MODEL || "claude-sonnet-4-20250514",
  }),
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
  .use(
    usageTracker(
      {
        "*": { inputPer1M: 3, outputPer1M: 15, imagePer1K: 4.8 },
      },
      { logPerCall: true },
    ),
  )
  .use(generateOnce);

await app.handler()(ctx);
const final = ctx.messages.filter((m) => m.role === "assistant").pop();
console.log("\nAssistant:\n", final?.content);
