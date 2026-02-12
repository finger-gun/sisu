import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Agent, createCtx, type Ctx } from "@sisu-ai/core";
import { anthropicAdapter } from "@sisu-ai/adapter-anthropic";
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

function ensureSkill(name: string, pkg: string) {
  const dest = path.join(process.cwd(), ".sisu", "skills", name);
  if (fs.existsSync(dest)) return dest;
  fs.mkdirSync(dest, { recursive: true });
  const source = path.join(process.cwd(), "node_modules", pkg);
  for (const entry of fs.readdirSync(source)) {
    fs.cpSync(path.join(source, entry), path.join(dest, entry), {
      recursive: true,
    });
  }
  return dest;
}

ensureSkill("code-review", "@sisu-ai/skill-code-review");
ensureSkill("repo-search", "@sisu-ai/skill-repo-search");

const terminal = createTerminalTool({
  roots: [process.cwd()],
  capabilities: { read: true, write: false, delete: false, exec: true },
  allowPipe: true,
  allowSequence: true,
});

const ctx = createCtx({
  model: anthropicAdapter({
    model: process.env.MODEL || "claude-3-5-sonnet-latest",
  }),
  input:
    process.env.USER_INPUT ||
    "Find where skills middleware is initialized and summarize its configuration. Use the repo-search skill.",
  systemPrompt:
    "You are a helpful assistant. Use skills when they provide structured guidance.",
  logLevel: (process.env.LOG_LEVEL as any) ?? "info",
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
  .use(skillsMiddleware({ directories: [".sisu/skills"] }))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 6 }))
  .use(iterativeToolCalling);

console.log("🚀 Running Anthropic skills example...");
await app.handler()(ctx);

const final = ctx.messages.filter((m: any) => m.role === "assistant").pop();
console.log("\n✅ Assistant response:\n", final?.content);
