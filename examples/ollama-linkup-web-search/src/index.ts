import "dotenv/config";
import { Agent, createCtx, parseLogLevel, execute, getExecutionResult } from "@sisu-ai/core";
import { ollamaAdapter } from "@sisu-ai/adapter-ollama";
import { registerTools } from "@sisu-ai/mw-register-tools";
import {
  inputToMessage,
  conversationBuffer,
} from "@sisu-ai/mw-conversation-buffer";
import { errorBoundary } from "@sisu-ai/mw-error-boundary";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";
import { linkupWebSearch } from "@sisu-ai/tool-web-search-linkup";

const ctx = createCtx({
  model: ollamaAdapter({ model: process.env.MODEL || "gemma4:e4b" }),
  input:
    process.argv.slice(2).join(" ") ||
    "Find the latest AI policy news in Europe.",
  systemPrompt:
    "You are a helpful assistant. Use webSearch when current web information is needed.",
  logLevel: parseLogLevel(process.env.LOG_LEVEL),
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
  .use(execute);

await app.handler()(ctx);
console.log("\nAssistant:\n", getExecutionResult(ctx)?.text);
