import "dotenv/config";
import { Agent, createCtx, type Ctx } from "@sisu-ai/core";
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

/**
 * Example: Terminal Tools with Ecosystem-Compatible Aliases
 *
 * This example demonstrates the tool alias feature, which allows you to register
 * tools with alternative names that are compatible with ecosystem standards.
 *
 * The terminal tool provides three functions:
 * - terminalRun (aliased as "bash")
 * - terminalReadFile (aliased as "read_file")
 * - terminalCd (aliased as "cd")
 *
 * When the model calls a tool, it will use the alias name (e.g., "bash").
 * Internally, SISU resolves the alias back to the canonical name for execution.
 *
 * Run this example with: pnpm --filter=openai-terminal-aliased dev
 */

const terminal = createTerminalTool({
  roots: [process.cwd()],
  capabilities: { read: true, write: false, delete: false, exec: true },
  allowPipe: true,
  allowSequence: true,
});

// Example prompt that encourages tool usage
const userInput =
  process.env.USER_INPUT ||
  "Please list the files in the current directory using the 'bash' command, then read the package.json file using 'read_file'.";

const ctx = createCtx({
  model: openAIAdapter({ model: process.env.MODEL || "gpt-4o-mini" }),
  input: userInput,
  systemPrompt: "You are a helpful assistant with access to terminal commands.",
  logLevel: (process.env.LOG_LEVEL as any) ?? "info",
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
  // Register tools with ecosystem-compatible aliases
  .use(
    registerTools(terminal.tools, {
      aliases: {
        terminalRun: "bash",
        terminalReadFile: "read_file",
        terminalCd: "cd",
      },
    }),
  )
  .use(inputToMessage)
  .use(conversationBuffer({ window: 6 }))
  .use(iterativeToolCalling);

console.log("🚀 Running agent with aliased terminal tools...");
console.log("📝 Prompt:", userInput);
console.log("🔧 Tool aliases:");
console.log("   - terminalRun → bash");
console.log("   - terminalReadFile → read_file");
console.log("   - terminalCd → cd");
console.log("");

await app.handler()(ctx);

const final = ctx.messages.filter((m) => m.role === "assistant").pop();
console.log("\n✅ Assistant response:\n", final?.content);
console.log("\n💡 Check the generated trace file (trace-*.html) to see:");
console.log("   - Tools sent to API with alias names (bash, read_file, cd)");
console.log("   - Model calling tools using alias names");
console.log(
  "   - SISU resolving aliases back to canonical names for execution",
);
