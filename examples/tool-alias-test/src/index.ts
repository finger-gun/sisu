import "dotenv/config";
import { Agent, createCtx } from "@sisu-ai/core";
import { openAIAdapter } from "@sisu-ai/adapter-openai";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";
import { iterativeToolCalling } from "@sisu-ai/mw-tool-calling";
import { registerTools } from "@sisu-ai/mw-register-tools";
import { createTerminalTool } from "@sisu-ai/tool-terminal";

/**
 * Test: Can GPT-4 infer that "bash" means "terminalRun"?
 *
 * Scenario: Skill says "use bash to list files"
 * But only terminalRun is available as a tool.
 *
 * Will the model:
 * A) Call terminalRun (inference succeeds)
 * B) Fail/say it doesn't have bash tool (inference fails)
 * C) Something else
 */

const terminal = createTerminalTool();

const ctx = createCtx({
  model: openAIAdapter({ model: process.env.MODEL || "gpt-4o" }),
  systemPrompt: `You are a helpful assistant with access to terminal tools.

IMPORTANT: You have a tool called "terminalRun" that executes bash commands.`,
  logLevel: (process.env.LOG_LEVEL as any) ?? "info",
});

// Simulate a skill instruction that references "bash"
ctx.messages.push({
  role: "user",
  content: `Please use the "bash" tool to list all files in the current directory with the command "ls -la".`,
});

const app = new Agent()
  .use(async (c, next) => {
    try {
      await next();
    } catch (e) {
      c.log.error(e);
      c.messages.push({ role: "assistant", content: `Error: ${e}` });
    }
  })
  .use(traceViewer())
  .use(registerTools(terminal.tools))
  .use(iterativeToolCalling);

await app.handler()(ctx);

console.log("\n--- TEST RESULTS ---\n");
console.log("Available tools:", terminal.tools.map((t) => t.name).join(", "));
console.log("User requested: bash tool");
console.log("\nModel response:");
const final = ctx.messages.filter((m) => m.role === "assistant").pop();
console.log(final?.content || "No response");

if (
  ctx.messages.some(
    (m) => m.role === "assistant" && "tool_calls" in m && m.tool_calls,
  )
) {
  console.log("\nTool calls made:");
  ctx.messages
    .filter((m) => m.role === "assistant" && "tool_calls" in m)
    .forEach((m) => {
      (m as any).tool_calls?.forEach((tc: any) => {
        console.log(
          `  - ${tc.function.name}(${JSON.stringify(JSON.parse(tc.function.arguments))})`,
        );
      });
    });
} else {
  console.log("\nNo tool calls made.");
}
