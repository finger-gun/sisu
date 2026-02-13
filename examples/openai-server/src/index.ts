import "dotenv/config";
import {
  Agent,
  createCtx,
  type Ctx,
  type ModelEvent,
  type ModelResponse,
} from "@sisu-ai/core";
import { errorBoundary } from "@sisu-ai/mw-error-boundary";
import { usageTracker } from "@sisu-ai/mw-usage-tracker";
import { openAIAdapter } from "@sisu-ai/adapter-openai";
import { agentRunApi, type HttpCtx } from "@sisu-ai/mw-agent-run-api";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";
import { cors } from "@sisu-ai/mw-cors";
import { Server } from "@sisu-ai/server";
import { InMemoryKV } from "@sisu-ai/core";

const model = openAIAdapter({ model: process.env.MODEL || "gpt-4o-mini" });
const basePath = process.env.BASE_PATH || "/api";
const healthPath = process.env.HEALTH_PATH || "/health";
const apiKey = process.env.API_KEY;

const generateOnce = async (c: HttpCtx) => {
  if (c.input) c.messages.push({ role: "user", content: c.input });
  const out = await c.model.generate(c.messages, {
    toolChoice: "none",
    signal: c.signal,
    stream: true,
  });
  if (
    out &&
    typeof (out as unknown as AsyncIterable<ModelEvent>)[
      Symbol.asyncIterator
    ] === "function"
  ) {
    for await (const ev of out as unknown as AsyncIterable<ModelEvent>) {
      if (ev?.type === "assistant_message" && ev.message) {
        c.messages.push(ev.message);
      }
    }
  } else if ((out as ModelResponse)?.message) {
    c.messages.push((out as ModelResponse).message);
  }
};
const store = new InMemoryKV();
const runApi = agentRunApi({ runStore: store, basePath, apiKey });
const app = new Agent<HttpCtx>()
  .use(
    errorBoundary(async (err, c) => {
      c.log.error(err);
      c.messages.push({
        role: "assistant",
        content: "Sorry, something went wrong.",
      });
    }),
  )
  .use(cors({ origin: "*", credentials: true }))
  .use(traceViewer())
  .use(
    usageTracker(
      {
        "*": { inputPer1M: 0.15, outputPer1M: 0.6 },
      },
      { logPerCall: true },
    ),
  )
  .use(runApi)
  .use(generateOnce);

const port = Number(process.env.PORT) || 3000;

const server = new Server(app, {
  logLevel: "debug",
  port,
  basePath,
  healthPath,
  bannerEndpoints: (runApi as { bannerEndpoints?: string[] }).bannerEndpoints,
  createCtx: (req, res) =>
    ({
      req,
      res,
      ...createCtx({
        model,
        systemPrompt: "You are a helpful assistant.",
        logLevel: process.env.LOG_LEVEL as
          | "debug"
          | "info"
          | "warn"
          | "error"
          | undefined,
      }),
    }) as HttpCtx,
});

server.listen();
