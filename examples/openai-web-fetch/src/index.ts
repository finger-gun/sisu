import "dotenv/config";
import { Agent, createCtx, parseLogLevel, execute, getExecutionResult } from "@sisu-ai/core";
import { openAIAdapter } from "@sisu-ai/adapter-openai";
import { registerTools } from "@sisu-ai/mw-register-tools";
import {
  inputToMessage,
  conversationBuffer,
} from "@sisu-ai/mw-conversation-buffer";
import { errorBoundary } from "@sisu-ai/mw-error-boundary";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";
import { webFetch } from "@sisu-ai/tool-web-fetch";

const urlArg = "https://en.wikipedia.org/wiki/Hubble_Space_Telescope";

const ctx = createCtx({
  model: openAIAdapter({ model: process.env.MODEL || "gpt-5.4" }),
  input: `Summarize the content from this URL: ${urlArg}.`,
  systemPrompt: "You are a helpful assistant.",
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
  .use(registerTools([webFetch]))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 6 }))
  .use(execute);

await app.handler()(ctx);
console.log("\nAssistant:\n", getExecutionResult(ctx)?.text);
