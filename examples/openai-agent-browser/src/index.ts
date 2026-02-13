import "dotenv/config";
import path from "node:path";
import { Agent, createCtx, type Ctx } from "@sisu-ai/core";
import { openAIAdapter } from "@sisu-ai/adapter-openai";
import { errorBoundary } from "@sisu-ai/mw-error-boundary";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";
import { registerTools } from "@sisu-ai/mw-register-tools";
import {
  inputToMessage,
  conversationBuffer,
} from "@sisu-ai/mw-conversation-buffer";
import { iterativeToolCalling } from "@sisu-ai/mw-tool-calling";
import { skillsMiddleware } from "@sisu-ai/mw-skills";
import { createTerminalTool } from "@sisu-ai/tool-terminal";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const skillDirs = [
  path.join(repoRoot, ".agents", "skills"),
  path.join(repoRoot, ".claude", "skills"),
];

const terminal = createTerminalTool({
  roots: [process.cwd()],
  capabilities: { read: true, write: false, delete: false, exec: true },
  commands: {
    allow: ["pwd", "ls", "cat", "grep", "rg", "find", "agent-browser"],
  },
  allowPipe: true,
  allowSequence: true,
});

const ctx = createCtx({
  model: openAIAdapter({ model: process.env.MODEL || "gpt-4o-mini" }),
  input:
    process.env.USER_INPUT ||
    "Open https://example.com and take a screenshot. Use the agent-browser skill.",
  systemPrompt:
    "You are a helpful assistant. Use skills when they provide structured guidance.",
  logLevel: process.env.LOG_LEVEL as
    | "debug"
    | "info"
    | "warn"
    | "error"
    | undefined,
});

const app = new Agent()
  .use(
    errorBoundary(async (err: unknown, c: Ctx) => {
      c.log.error(err);
      c.messages.push({
        role: "assistant",
        content: "Sorry, something went wrong.",
      });
    }),
  )
  .use(traceViewer())
  .use(
    registerTools(terminal.tools, {
      aliases: {
        terminalRun: "bash",
        terminalReadFile: "read_file",
        terminalCd: "cd",
      },
    }),
  )
  .use(skillsMiddleware({ directories: skillDirs }))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 6 }))
  .use(iterativeToolCalling);

console.log("🚀 Running OpenAI agent-browser skills example...");
await app.handler()(ctx);

const final = ctx.messages
  .filter((m: Ctx["messages"][number]) => m.role === "assistant")
  .pop();
console.log("\n✅ Assistant response:\n", final?.content);
