import "dotenv/config";
import {
  Agent,
  createCtx,
  execute,
  getExecutionResult,
  parseLogLevel,
  type Ctx,
} from "@sisu-ai/core";
import { openAIAdapter } from "@sisu-ai/adapter-openai";
import {
  inputToMessage,
  conversationBuffer,
} from "@sisu-ai/mw-conversation-buffer";
import { errorBoundary } from "@sisu-ai/mw-error-boundary";
import {
  orchestration,
  createInlineChildExecutor,
  type ChildExecutionRequest,
  type ChildExecutor,
} from "@sisu-ai/mw-orchestration";
import { registerTools } from "@sisu-ai/mw-register-tools";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";
import { usageTracker } from "@sisu-ai/mw-usage-tracker";
import { z } from "zod";

const lookupWeather = {
  name: "lookupWeather",
  description: "Look up weather for a city",
  schema: z.object({ city: z.string() }),
  handler: async ({ city }: { city: string }) => ({
    city,
    tempC: city.toLowerCase().includes("malmö") ? 13 : 20,
    summary: city.toLowerCase().includes("malmö")
      ? "Cloudy with intermittent showers"
      : "Mild and mostly clear",
  }),
};

const findIndoorOptions = {
  name: "findIndoorOptions",
  description: "Return indoor activity options for a city",
  schema: z.object({ city: z.string() }),
  handler: async ({ city }: { city: string }) => ({
    city,
    options: ["Museum visit", "Cafe break", "Design district walk"],
  }),
};

const findOutdoorOptions = {
  name: "findOutdoorOptions",
  description: "Return outdoor activity options for a city",
  schema: z.object({ city: z.string() }),
  handler: async ({ city }: { city: string }) => ({
    city,
    options: ["Canal-side walk", "Park stop", "Harbor viewpoint"],
  }),
};

const assessRisk = {
  name: "assessRisk",
  description: "Assess weather risk level",
  schema: z.object({ weatherSummary: z.string() }),
  handler: async ({ weatherSummary }: { weatherSummary: string }) => {
    const s = weatherSummary.toLowerCase();
    const risk = s.includes("storm")
      ? "high"
      : s.includes("shower") || s.includes("cloudy")
        ? "medium"
        : "low";
    return {
      risk,
      guidance:
        risk === "high"
          ? "Prioritize indoor plan."
          : risk === "medium"
            ? "Keep fallback options ready."
            : "Outdoor plan is fine.",
    };
  },
};

const userPrompt = "Plan an afternoon in Malmö with weather-aware choices and one fallback.";

const modelName = process.env.MODEL || "gpt-5.4";

const ctx = createCtx({
  model: openAIAdapter({ model: modelName }),
  input: userPrompt,
  systemPrompt:
    "You are an orchestration controller. Delegate specialist tasks with delegateTask and finish with finish(answer). Keep final output concise.",
  logLevel: parseLogLevel(process.env.LOG_LEVEL) ?? "info",
});

const inlineExecutor = createInlineChildExecutor({
  defaultTimeoutMs: 25_000,
  maxChildTurns: 6,
  allowedModels: [modelName],
  modelResolver: (_requestedModel, parentCtx) => parentCtx.model,
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const remoteLikeChildExecutor: ChildExecutor = async (
  request: ChildExecutionRequest,
  parentCtx: Ctx,
) => {
  const envelope = JSON.stringify(request);
  parentCtx.log.info?.("[remote-child-executor] send", {
    delegationId: request.delegationId,
    bytes: envelope.length,
  });

  // Simulate a transport boundary (queue/http) before worker execution.
  await wait(30);

  const workerRequest = JSON.parse(envelope) as ChildExecutionRequest;
  const result = await inlineExecutor(workerRequest, parentCtx);
  return {
    ...result,
    trace: {
      ...result.trace,
      file: "remote://mock-child-executor",
    },
  };
};

const app = new Agent()
  .use(
    errorBoundary(async (error, c) => {
      c.log.error("remote executor orchestration example error", error);
      c.messages.push({
        role: "assistant",
        content: "Sorry, the remote executor orchestration example failed.",
      });
    }),
  )
  .use(traceViewer())
  .use(usageTracker({ "*": { inputPer1M: 0.15, outputPer1M: 0.6 } }))
  .use(registerTools([lookupWeather, findIndoorOptions, findOutdoorOptions, assessRisk]))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 14 }))
  .use(
    orchestration({
      allowedModels: [modelName],
      maxDelegations: 10,
      maxDepth: 1,
      defaultTimeoutMs: 25_000,
      maxChildTurns: 6,
      childExecutor: remoteLikeChildExecutor,
      modelResolver: (_requestedModel, parentCtx) => parentCtx.model,
    }),
  )
  .use(execute);

await app.handler()(ctx);
console.log("\nAssistant:\n", getExecutionResult(ctx)?.text);
