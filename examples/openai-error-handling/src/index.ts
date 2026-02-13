import "dotenv/config";
import {
  Agent,
  createCtx,
  type Ctx,
  type Tool,
  type ToolContext,
  ToolExecutionError,
  ValidationError,
  ConfigurationError,
  TimeoutError,
  isSisuError,
  getErrorDetails,
} from "@sisu-ai/core";
import { errorBoundary, logErrors } from "@sisu-ai/mw-error-boundary";
import { registerTools } from "@sisu-ai/mw-register-tools";
import { toolCalling } from "@sisu-ai/mw-tool-calling";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";
import { openAIAdapter } from "@sisu-ai/adapter-openai";
import { z } from "zod";

/**
 * Example: Error Handling with Structured Error Types
 *
 * This example demonstrates:
 * 1. Different error types (ToolExecutionError, ValidationError, etc.)
 * 2. Error boundary middleware for graceful error handling
 * 3. Structured error logging and context preservation
 * 4. Error information in trace viewer
 */

// Tool that demonstrates validation errors
const validateInputTool: Tool = {
  name: "validateInput",
  description: "Validates user input (demonstrates ValidationError)",
  schema: z.object({
    email: z.string().email(),
    age: z.number().min(0).max(120),
  }),
  handler: async (args: { email: string; age: number }, ctx: ToolContext) => {
    // This demonstrates validation at the schema level
    // If schema validation fails, a ValidationError will be thrown
    ctx.log.info("Input validated successfully", args);
    return { valid: true, email: args.email, age: args.age };
  },
};

// Tool that demonstrates tool execution errors
const fetchWeatherTool: Tool = {
  name: "fetchWeather",
  description: "Fetch weather data (demonstrates ToolExecutionError)",
  schema: z.object({
    city: z.string(),
    units: z.enum(["metric", "imperial"]).optional(),
  }),
  handler: async (args: { city: string; units?: string }, ctx: ToolContext) => {
    ctx.log.info("Fetching weather for", args.city);

    // Simulate an API error
    const shouldFail = args.city.toLowerCase() === "nowhere";

    if (shouldFail) {
      // Throw a ToolExecutionError with context
      throw new ToolExecutionError(
        "Failed to fetch weather: City not found",
        "fetchWeather",
        args,
        new Error("API returned 404: City not found"),
      );
    }

    // Simulate successful response
    return {
      city: args.city,
      temperature: 22,
      conditions: "Sunny",
      units: args.units || "metric",
    };
  },
};

// Tool that demonstrates timeout errors
const slowOperationTool: Tool = {
  name: "slowOperation",
  description:
    "A slow operation that might timeout (demonstrates TimeoutError)",
  schema: z.object({
    duration: z.number().min(0).max(10000),
  }),
  handler: async (args: { duration: number }, ctx: ToolContext) => {
    const startTime = Date.now();
    const timeout = 3000; // 3 second timeout

    ctx.log.info("Starting slow operation", {
      duration: args.duration,
      timeout,
    });

    // Simulate a slow operation
    await new Promise((resolve) => setTimeout(resolve, args.duration));

    const elapsed = Date.now() - startTime;

    if (elapsed > timeout) {
      throw new TimeoutError(
        "Operation exceeded timeout",
        timeout,
        "slowOperation",
      );
    }

    return { completed: true, elapsed };
  },
};

// Tool that demonstrates configuration errors
const configuredTool: Tool = {
  name: "configuredOperation",
  description:
    "Operation requiring configuration (demonstrates ConfigurationError)",
  schema: z.object({
    action: z.string(),
  }),
  handler: async (args: { action: string }, ctx: ToolContext) => {
    // Check if required configuration is present
    const apiKey = ctx.deps?.apiKey;

    if (!apiKey) {
      throw new ConfigurationError(
        "API key is required but not configured",
        { provided: ctx.deps },
        "apiKey must be set in ctx.deps",
      );
    }

    ctx.log.info("Executing configured operation", args);
    return { success: true, action: args.action };
  },
};

// Middleware to demonstrate error context
const addErrorContext = async (c: Ctx, next: () => Promise<void>) => {
  const requestId = Math.random().toString(36).substring(7);
  c.state.requestId = requestId;
  c.log.info("Request started", { requestId });

  try {
    await next();
    c.log.info("Request completed successfully", { requestId });
  } catch (err) {
    c.log.error("Request failed", { requestId, error: getErrorDetails(err) });
    throw err;
  }
};

// Custom error handler that shows error details
const customErrorHandler = errorBoundary(async (err, ctx: Ctx) => {
  const details = getErrorDetails(err);

  console.log("\n=== Error Caught by Error Boundary ===");
  console.log("Name:", details.name);
  console.log("Message:", details.message);

  if (details.code) {
    console.log("Code:", details.code);
  }

  if (details.context) {
    console.log("Context:", JSON.stringify(details.context, null, 2));
  }

  if (isSisuError(err)) {
    console.log("This is a structured Sisu error");
  }

  console.log("======================================\n");

  // Add a friendly error message to the conversation
  ctx.messages.push({
    role: "assistant",
    content: `I encountered an error: ${details.message}. Let me try to help you in a different way.`,
  });
});

// Main application setup
async function runExample(
  scenario: "success" | "validation" | "execution" | "timeout" | "config",
) {
  console.log(`\n🔍 Running scenario: ${scenario}\n`);

  const prompts: Record<string, string> = {
    success: "Get the weather for Stockholm in metric units",
    validation: "Validate this email: invalid-email and age: -5",
    execution: 'Get the weather for the city called "Nowhere"',
    timeout: "Run a slow operation that takes 5000 milliseconds",
    config: "Run a configured operation to test the configuration",
  };

  const ctx = createCtx({
    model: openAIAdapter({ model: process.env.MODEL || "gpt-4o-mini" }),
    input: prompts[scenario],
    systemPrompt:
      "You are a helpful assistant. Use the provided tools to help the user.",
    logLevel: "info",
  });

  // Add configuration for the config scenario
  if (scenario === "config") {
    // Intentionally omit apiKey to trigger ConfigurationError
    ctx.state.toolDeps = { someOtherConfig: "value" };
  } else {
    ctx.state.toolDeps = { apiKey: "test-key-123" };
  }

  const app = new Agent()
    .use(addErrorContext)
    .use(customErrorHandler)
    .use(traceViewer({ enable: true }))
    .use(
      registerTools([
        validateInputTool,
        fetchWeatherTool,
        slowOperationTool,
        configuredTool,
      ]),
    )
    .use(toolCalling);

  try {
    await app.handler()(ctx);
    const final = ctx.messages.filter((m) => m.role === "assistant").pop();
    console.log("\n✅ Final response:\n", final?.content, "\n");
  } catch (err) {
    console.log(
      "\n❌ Unhandled error (escaped error boundary):\n",
      getErrorDetails(err),
      "\n",
    );
  }
}

// Run different scenarios to demonstrate various error types
async function main() {
  console.log(
    "╔═══════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║  Sisu Error Handling Example                                  ║",
  );
  console.log(
    "║  Demonstrates structured error types and error boundary       ║",
  );
  console.log(
    "╚═══════════════════════════════════════════════════════════════╝",
  );

  // Select scenario from command line or run all
  const scenario = process.argv[2] as
    | "success"
    | "validation"
    | "execution"
    | "timeout"
    | "config"
    | undefined;

  if (
    scenario &&
    ["success", "validation", "execution", "timeout", "config"].includes(
      scenario,
    )
  ) {
    await runExample(scenario);
  } else {
    // Run all scenarios
    console.log("\nRunning all scenarios...\n");

    await runExample("success");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await runExample("execution");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Note: Validation errors are caught during tool schema validation
    // and converted to ValidationError automatically
    console.log(
      "\n💡 To see ValidationError, try calling validateInput with invalid data",
    );
    console.log("💡 To see TimeoutError, try: npm run dev timeout");
    console.log("💡 To see ConfigurationError, try: npm run dev config");
    console.log(
      "\n📊 Check the traces/ directory for detailed error information in HTML format\n",
    );
  }
}

main().catch(console.error);
