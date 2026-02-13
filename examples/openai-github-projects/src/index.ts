import "dotenv/config";
import { Agent, createCtx } from "@sisu-ai/core";
import { openAIAdapter } from "@sisu-ai/adapter-openai";
import { registerTools } from "@sisu-ai/mw-register-tools";
import {
  inputToMessage,
  conversationBuffer,
} from "@sisu-ai/mw-conversation-buffer";
import { iterativeToolCalling as toolCalling } from "@sisu-ai/mw-tool-calling";
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
  model: openAIAdapter({ model: process.env.MODEL || "gpt-4o-mini" }),
  input: userInput,
  systemPrompt:
    "You are a helpful assistant. Use tools to interact with GitHub Projects. Start by planning out what tools to use and in what order, an interaction could require multiple tool calls in correct order.",
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
  .use(registerTools([...ghTools]))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 8 }))
  .use(toolCalling);

await app.handler()(ctx);
const final = ctx.messages.filter((m) => m.role === "assistant").pop();
console.log("\nAssistant:\n", final?.content);
