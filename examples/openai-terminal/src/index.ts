import "dotenv/config";
import { Agent, createCtx } from "@sisu-ai/core";
import { openAIAdapter } from "@sisu-ai/adapter-openai";
import { registerTools } from "@sisu-ai/mw-register-tools";
import {
  inputToMessage,
  conversationBuffer,
} from "@sisu-ai/mw-conversation-buffer";
import { iterativeToolCalling } from "@sisu-ai/mw-tool-calling";
import { errorBoundary } from "@sisu-ai/mw-error-boundary";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";
import { usageTracker } from "@sisu-ai/mw-usage-tracker";
import { createTerminalTool } from "@sisu-ai/tool-terminal";

const terminal = createTerminalTool({
  roots: [process.cwd()],
  capabilities: { read: true, write: false, delete: false, exec: true },
  allowPipe: true, // allow shell-free pipelines
  allowSequence: true, // allow ;, &&, || sequencing
});

const userInput =
  "You have multiple run-*.json files like run-20250907-233125.json. Using only pwd, ls, stat, wc, head, tail, cat, cut, sort, uniq, grep, write one piped command that counts how many runs' final output included README.md";

const ctx = createCtx({
  model: openAIAdapter({ model: process.env.MODEL || "gpt-4o-mini" }),
  input: userInput,
  systemPrompt: "You are a useful and helpful assistant.",
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
  .use(
    usageTracker(
      {
        "*": { inputPer1M: 0.15, outputPer1M: 0.6 },
      },
      { logPerCall: true },
    ),
  )
  .use(registerTools(terminal.tools))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 6 }))
  .use(iterativeToolCalling);

await app.handler()(ctx);
const final = ctx.messages.filter((m) => m.role === "assistant").pop();
console.log("\nAssistant:\n", final?.content);
