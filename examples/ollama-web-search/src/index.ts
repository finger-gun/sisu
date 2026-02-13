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
import { duckDuckGoWebSearch } from "@sisu-ai/tool-web-search-duckduckgo";

const ctx = createCtx({
  model: ollamaAdapter({ model: process.env.MODEL || "llama3.1" }),
  input: "Search the web for the tallest mountain in Europe.",
  systemPrompt:
    "You are a helpful assistant. Use the webSearch tool when you need external information.",
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
  .use(registerTools([duckDuckGoWebSearch]))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 6 }))
  .use(toolCalling);

await app.handler()(ctx);
const final = ctx.messages.filter((m) => m.role === "assistant").pop();
console.log("\nAssistant:\n", final?.content);
