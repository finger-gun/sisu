import "dotenv/config";
import {
  Agent,
  createCtx,
  execute,
  getExecutionResult,
  parseLogLevel,
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
  type DelegationResult,
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
    tempC: city.toLowerCase().includes("malmö") ? 14 : 19,
    summary: city.toLowerCase().includes("malmö")
      ? "Windy with light showers"
      : "Mild and mostly clear",
  }),
};

const findIndoorOptions = {
  name: "findIndoorOptions",
  description: "Return indoor activity options for a city",
  schema: z.object({ city: z.string() }),
  handler: async ({ city }: { city: string }) => ({
    city,
    options: [
      "Art museum visit",
      "Coffee roastery tasting",
      "Library and architecture walk",
    ],
  }),
};

const findOutdoorOptions = {
  name: "findOutdoorOptions",
  description: "Return outdoor activity options for a city",
  schema: z.object({ city: z.string() }),
  handler: async ({ city }: { city: string }) => ({
    city,
    options: ["Waterfront walk", "Public park picnic", "Bike city-center route"],
  }),
};

const condenseAnswer = {
  name: "condenseAnswer",
  description: "Condense a long response into a concise answer",
  schema: z.object({ text: z.string() }),
  handler: async ({ text }: { text: string }) => ({
    short: text.slice(0, 280),
  }),
};

const userPrompt = "Plan a half-day in Malmö with one outdoor option, one indoor fallback, and a short summary.";

const modelName = process.env.MODEL || "gpt-5.4";

const ctx = createCtx({
  model: openAIAdapter({ model: modelName }),
  input: userPrompt,
  systemPrompt:
    "You are an orchestration controller. Use delegateTask for specialist work and finish(answer) when ready. Keep the final answer concise and practical.",
  logLevel: parseLogLevel(process.env.LOG_LEVEL) ?? "info",
});

const inlineExecutor = createInlineChildExecutor({
  defaultTimeoutMs: 20_000,
  maxChildTurns: 6,
  allowedModels: [modelName],
  modelResolver: (_requestedModel, parentCtx) => parentCtx.model,
});

const customChildExecutor = async (
  request: ChildExecutionRequest,
  parentCtx: Parameters<typeof inlineExecutor>[1],
): Promise<DelegationResult> => {
  const started = Date.now();
  parentCtx.log.info?.("[custom-child-executor] dispatch", {
    delegationId: request.delegationId,
    tools: request.input.tools.allow,
    model: request.input.model?.name,
  });
  const result = await inlineExecutor(request, parentCtx);
  return {
    ...result,
    telemetry: {
      ...result.telemetry,
      durationMs: Date.now() - started,
    },
  };
};

const app = new Agent()
  .use(
    errorBoundary(async (error, c) => {
      c.log.error("custom executor orchestration example error", error);
      c.messages.push({
        role: "assistant",
        content: "Sorry, the custom executor orchestration example failed.",
      });
    }),
  )
  .use(traceViewer())
  .use(usageTracker({ "*": { inputPer1M: 0.15, outputPer1M: 0.6 } }))
  .use(
    registerTools([
      lookupWeather,
      findIndoorOptions,
      findOutdoorOptions,
      condenseAnswer,
    ]),
  )
  .use(inputToMessage)
  .use(conversationBuffer({ window: 14 }))
  .use(
    orchestration({
      allowedModels: [modelName],
      maxDelegations: 10,
      maxDepth: 1,
      defaultTimeoutMs: 20_000,
      maxChildTurns: 6,
      childExecutor: customChildExecutor,
      modelResolver: (_requestedModel, parentCtx) => parentCtx.model,
    }),
  )
  .use(execute);

await app.handler()(ctx);
console.log("\nAssistant:\n", getExecutionResult(ctx)?.text);
