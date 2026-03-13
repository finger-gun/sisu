import { randomUUID } from "crypto";
import {
  NullStream,
  SimpleTools,
  type Ctx,
  type LLM,
  type Message,
  type Middleware,
  type Tool,
  type ToolContext,
  type Usage,
} from "@sisu-ai/core";
import { z } from "zod";

export type DelegationStatus = "ok" | "error" | "cancelled" | "timeout";

export type DelegationContext = {
  messages?: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content: string;
  }>;
  memoryKeys?: string[];
  artifacts?: Array<{ type: string; value: string }>;
};

export type DelegationToolScope = {
  allow: string[];
};

export type DelegationModelRef = {
  name: string;
  provider?: "openai" | "anthropic" | "ollama" | string;
  opts?: Record<string, unknown>;
};

export type DelegateTaskInput = {
  instruction: string;
  context: DelegationContext;
  tools: DelegationToolScope;
  model: DelegationModelRef;
  metadata?: Record<string, unknown>;
};

export type DelegateTaskOptions = {
  timeoutMs?: number;
  maxChildTurns?: number;
  idempotencyKey?: string;
};

export type ChildExecutionRequest = {
  delegationId: string;
  input: DelegateTaskInput;
  options?: DelegateTaskOptions;
};

export interface DelegationResult {
  delegationId: string;
  status: DelegationStatus;
  output?: {
    summary: string;
    answer?: string;
    artifacts?: Array<{ type: string; value: string }>;
    citations?: string[];
  };
  telemetry: {
    startedAt: string;
    endedAt: string;
    durationMs: number;
    model: string;
    toolsAllowed: string[];
    toolsUsed: string[];
    usage?: Usage;
  };
  trace: {
    runId: string;
    parentRunId: string;
    file?: string;
  };
  error?: {
    name: string;
    message: string;
    code?: string;
    retryable?: boolean;
  };
}

export interface OrchestrationState {
  version: 1;
  runId: string;
  depth: number;
  maxDepth: number;
  status: "running" | "finished" | "aborted" | "error";
  steps: Array<{
    stepId: string;
    type: "delegate" | "finish";
    startedAt: string;
    endedAt?: string;
    status: "ok" | "error" | "cancelled" | "timeout";
    delegationId?: string;
  }>;
  children: Record<
    string,
    {
      delegationId: string;
      parentRunId: string;
      instruction: string;
      toolScope: string[];
      model: string;
      status: "running" | "ok" | "error" | "cancelled" | "timeout";
      usage?: Usage;
      trace?: { runId: string; file?: string };
      error?: { message: string; code?: string; retryable?: boolean };
    }
  >;
  totals: {
    delegations: number;
    succeeded: number;
    failed: number;
    durationMs: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    costUSD?: number;
  };
  policy: {
    allowParallel: boolean;
    defaultTimeoutMs: number;
    allowedModels: string[];
  };
}

export type ChildExecutor = (
  request: ChildExecutionRequest,
  parentCtx: Ctx,
) => Promise<DelegationResult>;

export interface OrchestrationOptions {
  allowedModels?: string[];
  maxDepth?: number;
  maxDelegations?: number;
  defaultTimeoutMs?: number;
  maxChildTurns?: number;
  childExecutor?: ChildExecutor;
  modelResolver?: (modelRef: DelegationModelRef, parentCtx: Ctx) => LLM;
}

const delegateTaskSchema = z.object({
  instruction: z.string().min(1),
  context: z
    .object({
      messages: z
        .array(
          z.object({
            role: z.enum(["system", "user", "assistant", "tool"]),
            content: z.string(),
          }),
        )
        .optional(),
      memoryKeys: z.array(z.string()).optional(),
      artifacts: z
        .array(z.object({ type: z.string(), value: z.string() }))
        .optional(),
    })
    .default({}),
  tools: z.object({ allow: z.array(z.string()).min(1) }),
  model: z.object({
    name: z.string().min(1),
    provider: z.string().optional(),
    opts: z.record(z.string(), z.unknown()).optional(),
  }),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const finishSchema = z.object({
  answer: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  notes: z.string().optional(),
});

export const orchestration = (opts: OrchestrationOptions = {}): Middleware => {
  const maxDepth = opts.maxDepth ?? 1;
  const maxDelegations = opts.maxDelegations ?? 8;
  const defaultTimeoutMs = opts.defaultTimeoutMs ?? 30_000;
  const maxChildTurns = opts.maxChildTurns ?? 8;

  return async (ctx: Ctx, next: () => Promise<void>) => {
    await next();

    const state = ensureState(ctx, {
      maxDepth,
      defaultTimeoutMs,
      allowedModels: opts.allowedModels ?? [],
    });
    const runStartedAt = Date.now();

    if (state.depth > state.maxDepth) {
      throw new Error(
        `[orchestration] depth ${state.depth} exceeds maxDepth ${state.maxDepth}`,
      );
    }

    const childExecutor =
      opts.childExecutor ??
      createInlineChildExecutor({
        defaultTimeoutMs,
        maxChildTurns,
        allowedModels: opts.allowedModels ?? [],
        modelResolver: opts.modelResolver,
      });

    let delegations = 0;

    while (!ctx.signal.aborted) {
      if (delegations > maxDelegations) {
        throw new Error(
          `[orchestration] max delegations reached (${maxDelegations})`,
        );
      }

      const out = await ctx.model.generate(ctx.messages, {
        signal: ctx.signal,
        toolChoice: "auto",
        tools: [delegateControlTool, finishControlTool],
        parallelToolCalls: false,
      });
      const msg = out.message;
      const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];

      if (calls.length === 0) {
        ctx.messages.push(msg);
        state.status = "finished";
        state.totals.durationMs = Date.now() - runStartedAt;
        return;
      }

      ctx.messages.push(msg);

      for (const call of calls) {
        if (call.name === "delegateTask") {
          delegations += 1;
          const stepId = randomUUID();
          const stepStart = new Date().toISOString();
          state.steps.push({
            stepId,
            type: "delegate",
            startedAt: stepStart,
            status: "ok",
            delegationId: call.id,
          });

          ctx.log.info?.("[orchestration] delegate.start", {
            stepId,
            delegationId: call.id,
          });

          const result = await runDelegation(
            call,
            ctx,
            state,
            childExecutor,
            defaultTimeoutMs,
            maxChildTurns,
          );

          const step = state.steps[state.steps.length - 1];
          step.status = result.status;
          step.endedAt = new Date().toISOString();

          if (result.status === "ok") {
            state.totals.succeeded += 1;
          } else {
            state.totals.failed += 1;
          }
          state.totals.delegations += 1;
          aggregateUsage(state, result.telemetry.usage);
          state.children[result.delegationId] = {
            delegationId: result.delegationId,
            parentRunId: result.trace.parentRunId,
            instruction:
              readInstructionFromArgs(call.arguments) ?? "delegated task",
            toolScope: result.telemetry.toolsAllowed,
            model: result.telemetry.model,
            status: result.status,
            usage: result.telemetry.usage,
            trace: { runId: result.trace.runId, file: result.trace.file },
            error: result.error
              ? {
                  message: result.error.message,
                  code: result.error.code,
                  retryable: result.error.retryable,
                }
              : undefined,
          };

          ctx.log.info?.("[orchestration] delegate.result", {
            stepId,
            delegationId: result.delegationId,
            status: result.status,
            error: result.error?.message,
          });

          const toolMessage: Message = {
            role: "tool",
            content: JSON.stringify(result),
            ...(call.id ? { tool_call_id: call.id } : { name: call.name }),
          } as Message;
          ctx.messages.push(toolMessage);
          continue;
        }

        if (call.name === "finish") {
          const parsed = finishSchema.parse(call.arguments);
          const stepId = randomUUID();
          state.steps.push({
            stepId,
            type: "finish",
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            status: "ok",
          });
          ctx.log.info?.("[orchestration] finish", {
            stepId,
            confidence: parsed.confidence,
          });
          ctx.messages.push({ role: "assistant", content: parsed.answer });
          state.status = "finished";
          state.totals.durationMs = Date.now() - runStartedAt;
          return;
        }

        throw new Error(
          `[orchestration] unsupported control tool call: ${call.name}`,
        );
      }
    }

    state.status = "aborted";
  };
};

const delegateControlTool: Tool = {
  name: "delegateTask",
  description:
    "Delegate specialized execution with a 4-tuple: instruction, context, tools, model",
  schema: delegateTaskSchema,
  handler: async () => ({ ok: true }),
};

const finishControlTool: Tool = {
  name: "finish",
  description: "Finish orchestration and return final answer",
  schema: finishSchema,
  handler: async () => ({ ok: true }),
};

async function runDelegation(
  call: { id: string; name: string; arguments: unknown },
  ctx: Ctx,
  state: OrchestrationState,
  childExecutor: ChildExecutor,
  defaultTimeoutMs: number,
  maxChildTurns: number,
): Promise<DelegationResult> {
  const delegationId = call.id || randomUUID();
  const parsed = delegateTaskSchema.safeParse(call.arguments);

  if (!parsed.success) {
    return {
      delegationId,
      status: "error",
      telemetry: {
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: 0,
        model: "unknown",
        toolsAllowed: [],
        toolsUsed: [],
      },
      trace: {
        runId: randomUUID(),
        parentRunId: state.runId,
      },
      error: {
        name: "ValidationError",
        message: parsed.error.message,
      },
    };
  }

  const request: ChildExecutionRequest = {
    delegationId,
    input: parsed.data,
    options: {
      timeoutMs: defaultTimeoutMs,
      maxChildTurns,
    },
  };

  try {
    return await childExecutor(request, ctx);
  } catch (error) {
    const err = error as Error;
    return {
      delegationId,
      status: "error",
      telemetry: {
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: 0,
        model: parsed.data.model.name,
        toolsAllowed: parsed.data.tools.allow,
        toolsUsed: [],
      },
      trace: {
        runId: randomUUID(),
        parentRunId: state.runId,
      },
      error: {
        name: err.name,
        message: err.message,
      },
    };
  }
}

export function createInlineChildExecutor(
  opts: {
    defaultTimeoutMs: number;
    maxChildTurns: number;
    allowedModels: string[];
    modelResolver?: (modelRef: DelegationModelRef, parentCtx: Ctx) => LLM;
  },
): ChildExecutor {
  return async (request, parentCtx) => {
    const startedAt = new Date();
    const parentState = ensureState(parentCtx, {
      maxDepth: 1,
      defaultTimeoutMs: opts.defaultTimeoutMs,
      allowedModels: opts.allowedModels,
    });

    const input = request.input;
    validateScope(parentCtx, input, opts.allowedModels);

    const model =
      opts.modelResolver?.(input.model, parentCtx) ?? resolveModel(input.model, parentCtx);

    const childRunId = randomUUID();
    const parentRunId = parentState.runId;
    const timeoutMs = request.options?.timeoutMs ?? opts.defaultTimeoutMs;
    const childSignal = withTimeoutSignal(parentCtx.signal, timeoutMs);

    const childCtx = buildChildCtx(parentCtx, {
      model,
      signal: childSignal,
      runId: childRunId,
      parentRunId,
      input,
    });

    const run = await executeChild(childCtx, request.options?.maxChildTurns ?? opts.maxChildTurns);

    const endedAt = new Date();
    const usage = getUsage(childCtx);
    const durationMs = endedAt.getTime() - startedAt.getTime();

    const abortReason = childSignal.aborted ? String(childSignal.reason ?? "") : "";
    const status: DelegationStatus = childSignal.aborted
      ? abortReason.includes("timed out")
        ? "timeout"
        : "cancelled"
      : "ok";

    return {
      delegationId: request.delegationId,
      status,
      output: {
        summary: run.summary,
        answer: run.answer,
      },
      telemetry: {
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationMs,
        model: model.name,
        toolsAllowed: input.tools.allow,
        toolsUsed: Array.from(run.toolsUsed),
        usage,
      },
      trace: {
        runId: childRunId,
        parentRunId,
      },
    };
  };
}

function ensureState(
  ctx: Ctx,
  defaults: {
    maxDepth: number;
    defaultTimeoutMs: number;
    allowedModels: string[];
  },
): OrchestrationState {
  const existing = ctx.state.orchestration as OrchestrationState | undefined;
  if (existing) return existing;

  const state: OrchestrationState = {
    version: 1,
    runId: randomUUID(),
    depth: 0,
    maxDepth: defaults.maxDepth,
    status: "running",
    steps: [],
    children: {},
    totals: {
      delegations: 0,
      succeeded: 0,
      failed: 0,
      durationMs: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUSD: 0,
    },
    policy: {
      allowParallel: false,
      defaultTimeoutMs: defaults.defaultTimeoutMs,
      allowedModels: defaults.allowedModels,
    },
  };

  ctx.state.orchestration = state;
  return state;
}

function validateScope(
  parentCtx: Ctx,
  input: DelegateTaskInput,
  allowedModels: string[],
): void {
  if (allowedModels.length > 0 && !allowedModels.includes(input.model.name)) {
    throw new Error(`[orchestration] model '${input.model.name}' is not allowed`);
  }
  for (const toolName of input.tools.allow) {
    if (!parentCtx.tools.get(toolName)) {
      throw new Error(`[orchestration] unknown delegated tool '${toolName}'`);
    }
  }
}

function resolveModel(modelRef: DelegationModelRef, parentCtx: Ctx): LLM {
  if (modelRef.name && parentCtx.model.name !== modelRef.name) {
    throw new Error(
      `[orchestration] unable to resolve model '${modelRef.name}' without modelResolver`,
    );
  }
  return parentCtx.model;
}

function buildChildCtx(
  parentCtx: Ctx,
  opts: {
    model: LLM;
    signal: AbortSignal;
    runId: string;
    parentRunId: string;
    input: DelegateTaskInput;
  },
): Ctx {
  const tools = new SimpleTools();
  for (const name of opts.input.tools.allow) {
    const tool = parentCtx.tools.get(name);
    if (tool) tools.register(tool);
  }

  const baseMessages = (opts.input.context.messages ?? []).map(
    (m): Message => ({ role: m.role, content: m.content }) as Message,
  );
  baseMessages.push({ role: "user", content: opts.input.instruction });

  const childState = {
    ...parentCtx.state,
    orchestration: {
      ...(parentCtx.state.orchestration as OrchestrationState | undefined),
      runId: opts.runId,
      depth:
        Number(
          (parentCtx.state.orchestration as OrchestrationState | undefined)
            ?.depth ?? 0,
        ) + 1,
      parentRunId: opts.parentRunId,
    },
  };

  return {
    input: opts.input.instruction,
    messages: baseMessages,
    model: opts.model,
    tools,
    memory: parentCtx.memory,
    stream: new NullStream(),
    state: childState,
    signal: opts.signal,
    log: parentCtx.log,
  };
}

async function executeChild(
  childCtx: Ctx,
  maxChildTurns: number,
): Promise<{ answer: string; summary: string; toolsUsed: Set<string> }> {
  const toolsUsed = new Set<string>();
  for (let turn = 0; turn < maxChildTurns; turn++) {
    if (childCtx.signal.aborted) break;

    const out = await childCtx.model.generate(childCtx.messages, {
      signal: childCtx.signal,
      toolChoice: "auto",
      tools: childCtx.tools.list(),
      parallelToolCalls: false,
    });
    const msg = out.message;
    const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];

    if (calls.length === 0) {
      childCtx.messages.push(msg);
      const answer = typeof msg.content === "string" ? msg.content : "";
      return { answer, summary: answer.slice(0, 400), toolsUsed };
    }

    childCtx.messages.push(msg);
    for (const call of calls) {
      const tool = childCtx.tools.get(call.name);
      if (!tool) {
        throw new Error(`[orchestration] child unknown tool '${call.name}'`);
      }
      toolsUsed.add(call.name);

      const parsedArgs = tool.schema && hasParse(tool.schema)
        ? tool.schema.parse(call.arguments)
        : call.arguments;

      const toolCtx: ToolContext = {
        memory: childCtx.memory,
        signal: childCtx.signal,
        log: childCtx.log,
        model: childCtx.model,
        deps: childCtx.state.toolDeps as Record<string, unknown> | undefined,
      };
      const result = await tool.handler(parsedArgs as never, toolCtx);
      const toolMessage: Message = {
        role: "tool",
        content: JSON.stringify(result),
        ...(call.id ? { tool_call_id: call.id } : { name: call.name }),
      } as Message;
      childCtx.messages.push(toolMessage);
    }
  }

  const answer = "";
  return { answer, summary: answer, toolsUsed };
}

function hasParse(value: unknown): value is { parse: (input: unknown) => unknown } {
  return Boolean(
    value &&
      typeof value === "object" &&
      "parse" in value &&
      typeof (value as { parse?: unknown }).parse === "function",
  );
}

function getUsage(ctx: Ctx): Usage | undefined {
  const usage = ctx.state.usage as Usage | undefined;
  if (!usage) return undefined;
  return {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    costUSD: usage.costUSD,
  };
}

function aggregateUsage(state: OrchestrationState, usage?: Usage): void {
  if (!usage) return;
  state.totals.promptTokens =
    Number(state.totals.promptTokens ?? 0) + Number(usage.promptTokens ?? 0);
  state.totals.completionTokens =
    Number(state.totals.completionTokens ?? 0) +
    Number(usage.completionTokens ?? 0);
  state.totals.totalTokens =
    Number(state.totals.totalTokens ?? 0) + Number(usage.totalTokens ?? 0);
  state.totals.costUSD =
    Number(state.totals.costUSD ?? 0) + Number(usage.costUSD ?? 0);
}

function withTimeoutSignal(signal: AbortSignal, timeoutMs: number): AbortSignal {
  if (timeoutMs <= 0) return signal;

  const ac = new AbortController();
  const onParentAbort = () => ac.abort(signal.reason);
  signal.addEventListener("abort", onParentAbort, { once: true });

  const timer = setTimeout(() => {
    ac.abort(new Error("Delegation timed out"));
  }, timeoutMs);

  ac.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onParentAbort);
    },
    { once: true },
  );

  if (signal.aborted) ac.abort(signal.reason);
  return ac.signal;
}

function readInstructionFromArgs(args: unknown): string | undefined {
  if (!args || typeof args !== "object") return undefined;
  const instruction = (args as { instruction?: unknown }).instruction;
  return typeof instruction === "string" ? instruction : undefined;
}
