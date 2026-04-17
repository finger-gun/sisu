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
import { orchestration } from "@sisu-ai/mw-orchestration";
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
    tempC: city.toLowerCase().includes("malmö") ? 14 : 18,
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
    options: [
      "Waterfront walk",
      "Public park picnic",
      "Bike route through city center",
    ],
  }),
};

const evaluatePlanRisk = {
  name: "evaluatePlanRisk",
  description: "Evaluate plan risk under weather conditions",
  schema: z.object({
    weatherSummary: z.string(),
    plannedActivities: z.array(z.string()),
  }),
  handler: async (
    {
      weatherSummary,
      plannedActivities,
    }: { weatherSummary: string; plannedActivities: string[] },
  ) => {
    const s = weatherSummary.toLowerCase();
    const risk = s.includes("storm")
      ? "high"
      : s.includes("shower") || s.includes("windy")
        ? "medium"
        : "low";
    return {
      risk,
      warning:
        risk === "high"
          ? "Move activities indoors"
          : risk === "medium"
            ? "Keep backup options available"
            : "Plan is weather-resilient",
      plannedActivities,
    };
  },
};

const condenseAnswer = {
  name: "condenseAnswer",
  description: "Condense a long response into a concise answer",
  schema: z.object({ text: z.string() }),
  handler: async ({ text }: { text: string }) => ({
    short: text.slice(0, 280),
  }),
};

const argvPrompt = process.argv
  .slice(2)
  .filter(
    (arg) =>
      arg !== "--" &&
      !arg.startsWith("--trace") &&
      !arg.startsWith("--trace-style") &&
      !arg.startsWith("--openai-") &&
      !arg.startsWith("--api-key") &&
      !arg.startsWith("--base-url") &&
      !arg.startsWith("--model"),
  )
  .join(" ")
  .trim();

const userPrompt =
  argvPrompt ||
  "Create a half-day plan in Malmö, adapt to weather uncertainty, and include a fallback option.";

const modelName = process.env.MODEL || "gpt-5.4";

const ctx = createCtx({
  model: openAIAdapter({ model: modelName }),
  input: userPrompt,
  systemPrompt: `You are an adaptive orchestration controller.\nYou MAY delegate using delegateTask when it improves quality, confidence, or safety.\nYou do not need fixed phases. Decide dynamically if/when to delegate and how many times.\nAlways enforce tool/model scoping in each delegation.\nStop delegating when confidence is sufficient or additional delegation has low expected value.\nWhen finished, call finish(answer).\nAllowed child tools: lookupWeather, findIndoorOptions, findOutdoorOptions, evaluatePlanRisk, condenseAnswer.\nIf delegation feedback indicates an invalid payload, correct and retry.`,
  logLevel: parseLogLevel(process.env.LOG_LEVEL) ?? "info",
});

const app = new Agent()
  .use(
    errorBoundary(async (error, c) => {
      c.log.error("adaptive orchestration example error", error);
      c.messages.push({
        role: "assistant",
        content: "Sorry, the adaptive orchestration example failed.",
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
      evaluatePlanRisk,
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
      defaultTimeoutMs: 25_000,
      maxChildTurns: 6,
      modelResolver: (_requestedModel, parentCtx) => parentCtx.model,
    }),
  )
  .use(execute);

await app.handler()(ctx);

console.log("\nAssistant:\n", getExecutionResult(ctx)?.text);
