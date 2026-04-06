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
import ghTools from "@sisu-ai/tool-github-projects";

const userInput =
  process.argv
    .filter((a) => !a.startsWith("--"))
    .slice(2)
    .join(" ") ||
  "List issues for the configured project, then show details for the first one, then list columns.";

const ctx = createCtx({
  model: openAIAdapter({ model: process.env.MODEL || "gpt-5.4" }),
  input: userInput,
  systemPrompt:
    "You are a helpful assistant. Use tools to interact with GitHub Projects. Start by planning out what tools to use and in what order, an interaction could require multiple tool calls in correct order.",
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
  .use(registerTools([...ghTools]))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 8 }))
  .use(execute);

await app.handler()(ctx);
console.log("\nAssistant:\n", getExecutionResult(ctx)?.text);
