import "dotenv/config";
import { Agent, createCtx } from "@sisu-ai/core";
import { anthropicAdapter } from "@sisu-ai/adapter-anthropic";
import { registerTools } from "@sisu-ai/mw-register-tools";
import {
  inputToMessage,
  conversationBuffer,
} from "@sisu-ai/mw-conversation-buffer";
import { toolCalling } from "@sisu-ai/mw-tool-calling";
import { errorBoundary } from "@sisu-ai/mw-error-boundary";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";
import { linkupWebSearch } from "@sisu-ai/tool-web-search-linkup";

const ctx = createCtx({
  model: anthropicAdapter({
    apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.API_KEY,
    model: process.env.MODEL || "claude-3-5-sonnet-latest",
  }),
  input:
    process.argv.slice(2).join(" ") ||
    "Summarize the latest major AI regulation updates globally.",
  systemPrompt:
    "You are a helpful assistant. Use webSearch when current web information is needed.",
  logLevel: process.env.LOG_LEVEL as
    | "debug"
    | "info"
    | "warn"
    | "error"
    | undefined,
});

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
  .use(registerTools([linkupWebSearch]))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 6 }))
  .use(toolCalling);

await app.handler()(ctx);
const final = ctx.messages.filter((m) => m.role === "assistant").pop();
console.log("\nAssistant:\n", final?.content);
