import "dotenv/config";
import { Agent, createCtx } from "@sisu-ai/core";
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

const getWeather = {
  name: "getWeather",
  description: "Get weather for a city",
  schema: z.object({ city: z.string() }),
  handler: async ({ city }: { city: string }) => ({
    city,
    tempC: 21,
    summary: "Sunny",
  }),
};

const getCityEvents = {
  name: "getCityEvents",
  description: "Get notable city events for a daytime period",
  schema: z.object({
    city: z.string(),
    dayPart: z.enum(["morning", "afternoon", "evening"]).default("afternoon"),
  }),
  handler: async ({ city, dayPart }: { city: string; dayPart?: string }) => ({
    city,
    dayPart: dayPart ?? "afternoon",
    events:
      (dayPart ?? "afternoon") === "morning"
        ? ["Ribersborg beach walk", "Coffee at local roastery"]
        : (dayPart ?? "afternoon") === "afternoon"
          ? ["Moderna Museet Malmö", "Canal-side lunch"]
          : ["Lilla Torg dinner", "Sunset viewpoint"],
  }),
};

const assessOutdoorRisk = {
  name: "assessOutdoorRisk",
  description: "Assess weather risk for outdoor activities",
  schema: z.object({
    tempC: z.number(),
    summary: z.string(),
    activity: z.string(),
  }),
  handler: async (
    {
      tempC,
      summary,
      activity,
    }: { tempC: number; summary: string; activity: string },
  ) => {
    const summaryLower = summary.toLowerCase();
    const weatherRisk =
      summaryLower.includes("rain") || summaryLower.includes("storm")
        ? "high"
        : tempC < 8 || tempC > 32
          ? "medium"
          : "low";
    return {
      activity,
      weatherRisk,
      recommendation:
        weatherRisk === "high"
          ? "Prefer indoor backup option"
          : weatherRisk === "medium"
            ? "Keep flexible timing"
            : "Proceed as planned",
    };
  },
};

const summarizePlan = {
  name: "summarizePlan",
  description: "Summarize an action plan",
  schema: z.object({ text: z.string() }),
  handler: async ({ text }: { text: string }) => ({
    summary: text.slice(0, 140),
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
  argvPrompt || "Plan a weather-aware day in Malmö and keep it concise.";

const modelName = process.env.MODEL || "gpt-4o-mini";

const ctx = createCtx({
  model: openAIAdapter({ model: modelName }),
  input: userPrompt,
  systemPrompt:
    `You are an orchestration controller.\nAlways use delegateTask for specialized work and finish with finish(answer).\nYou must complete exactly 3 delegation phases before finish:\n1) research phase using tools [getWeather, getCityEvents]\n2) risk phase using tools [assessOutdoorRisk]\n3) synthesis phase using tools [summarizePlan]\nWhen delegating, set model.name to exactly: ${modelName}.\nUse delegateTask args exactly as: { instruction, context: { messages?: [] }, tools: { allow: string[] }, model: { name: string } }.\nIf a delegation fails, retry with corrected args.\nFinal answer must include: plan, risk note, and one backup option.`,
  logLevel: (process.env.LOG_LEVEL as
    | "debug"
    | "info"
    | "warn"
    | "error"
    | undefined) ?? "info",
});

const app = new Agent()
  .use(
    errorBoundary(async (error, c) => {
      c.log.error("orchestration example error", error);
      c.messages.push({
        role: "assistant",
        content: "Sorry, the orchestration example failed.",
      });
    }),
  )
  .use(traceViewer())
  .use(usageTracker({ "*": { inputPer1M: 0.15, outputPer1M: 0.6 } }))
  .use(registerTools([getWeather, getCityEvents, assessOutdoorRisk, summarizePlan]))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 12 }))
  .use(
    orchestration({
      allowedModels: [modelName],
      maxDelegations: 10,
      defaultTimeoutMs: 30_000,
      maxChildTurns: 6,
      modelResolver: (_requestedModel, parentCtx) => parentCtx.model,
    }),
  );

await app.handler()(ctx);

const final = ctx.messages.filter((m) => m.role === "assistant").pop();
console.log("\nAssistant:\n", final?.content);
