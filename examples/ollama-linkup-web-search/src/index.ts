import "dotenv/config";
import { Agent, createCtx } from "@sisu-ai/core";
import { ollamaAdapter } from "@sisu-ai/adapter-ollama";
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
  model: ollamaAdapter({ model: process.env.MODEL || "llama3.1" }),
  input:
    process.argv.slice(2).join(" ") ||
    "Find the latest AI policy news in Europe.",
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
