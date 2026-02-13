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
import {
  s3GetObject,
  s3ListObjectsDetailed,
  s3DeleteObject,
} from "@sisu-ai/tool-aws-s3";
import { usageTracker } from "@sisu-ai/mw-usage-tracker";

const bucket = process.env.AWS_S3_BUCKET || "my-bucket";
const prefix = process.env.AWS_S3_PREFIX || "";

const ctx = createCtx({
  model: openAIAdapter({ model: process.env.MODEL || "gpt-4o-mini" }),
  input: `List 3 largest files in s3://${bucket}/${prefix}.`,
  systemPrompt: "You are a helpful assistant.",
  logLevel: process.env.LOG_LEVEL as
    | "debug"
    | "info"
    | "warn"
    | "error"
    | undefined,
  state: {
    s3: {
      allowWrite: /^(1|true|yes)$/i.test(
        String(process.env.AWS_S3_ALLOW_WRITE || ""),
      ),
    },
  },
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
  .use(
    usageTracker(
      {
        "openai:gpt-4o-mini": {
          // Preferred: prices per 1M tokens (matches provider docs)
          inputPer1M: 0.15,
          outputPer1M: 0.6,
          // Optional vision pricing (choose one):
          // a) Per 1K images (e.g., $0.217/K images)
          imagePer1K: 0.217,
          // b) Approximate per-1K "image tokens"
          // imageInputPer1K: 0.217,
          // imageTokenPerImage: 1000,
        },
        // Fallback default for other models
        "*": { inputPer1M: 0.15, outputPer1M: 0.6 },
      },
      { logPerCall: true },
    ),
  )
  .use(traceViewer())
  .use(registerTools([s3ListObjectsDetailed, s3GetObject, s3DeleteObject]))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 6 }))
  .use(iterativeToolCalling);

await app.handler()(ctx);
const final = ctx.messages.filter((m) => m.role === "assistant").pop();
console.log("\nAssistant:\n", final?.content);
