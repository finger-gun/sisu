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
import { azureGetBlob, azureListBlobsDetailed } from "@sisu-ai/tool-azure-blob";

const container = process.env.AZURE_CONTAINER || "test";

const ctx = createCtx({
  model: openAIAdapter({ model: process.env.MODEL || "gpt-5.4" }),
  input: `Read the latest blob in my container ${container} on Azure Storage.`,
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
  .use(registerTools([azureGetBlob, azureListBlobsDetailed]))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 6 }))
  .use(execute);

await app.handler()(ctx);
console.log("\nAssistant:\n", getExecutionResult(ctx)?.text);
