import "dotenv/config";
import { Agent, createCtx, execute, getExecutionResult, type Tool } from "@sisu-ai/core";
import { registerTools } from "@sisu-ai/mw-register-tools";
import {
  inputToMessage,
  conversationBuffer,
} from "@sisu-ai/mw-conversation-buffer";
import { errorBoundary } from "@sisu-ai/mw-error-boundary";
import { anthropicAdapter } from "@sisu-ai/adapter-anthropic";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";
import { z } from "zod";

// Tool
interface WeatherArgs {
  city: string;
}
const weather: Tool<WeatherArgs> = {
  name: "getWeather",
  description: "Get weather for a city",
  schema: z.object({ city: z.string() }),
  handler: async ({ city }) => ({ city, tempC: 21, summary: "Sunny" }),
};

// Ctx
const ctx = createCtx({
  model: anthropicAdapter({
    model: process.env.MODEL || "claude-sonnet-4-20250514",
  }),
  input: process.argv.slice(2).join(" ") || "What is the weather in Malmö?",
  systemPrompt: "You are a helpful assistant.",
});

// Minimal pipeline: no classifier, no switch, no manual loop
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
  .use(registerTools([weather]))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 8 }))
  .use(execute);

await app.handler()(ctx);
console.log("\nAssistant:\n", getExecutionResult(ctx)?.text);
