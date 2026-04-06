import "dotenv/config";
import {
  Agent,
  createCtx,
  stdoutStream,
  bufferStream,
  teeStream,
  executeStream,
  inputToMessage,
  parseLogLevel,
} from "@sisu-ai/core";
import { anthropicAdapter } from "@sisu-ai/adapter-anthropic";

// Optional: capture a copy while also printing to stdout for demo purposes
const buf = bufferStream();

const ctx = createCtx({
  model: anthropicAdapter({
    model: process.env.MODEL || "claude-sonnet-4-20250514",
  }),
  input: "Please explain our solar system as if I was 5.",
  systemPrompt: "You are a helpful assistant.",
  stream: teeStream(stdoutStream, buf.stream), // or just stdoutStream
  logLevel: parseLogLevel(process.env.LOG_LEVEL),
});

const app = new Agent().use(inputToMessage).use(executeStream);

await app.handler()(ctx);

// If you used teeStream, you can also access the full streamed text:
console.log("\n\nCaptured buffer copy:\n", buf.getText());
