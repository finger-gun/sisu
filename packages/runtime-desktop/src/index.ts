import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import http from "http";
import type { AddressInfo } from "net";
import { anthropicAdapter } from "@sisu-ai/adapter-anthropic";
import { ollamaAdapter } from "@sisu-ai/adapter-ollama";
import { openAIAdapter } from "@sisu-ai/adapter-openai";
import {
  compose,
  createCtx,
  InMemoryKV,
  type Ctx,
  type LLM,
  type Logger,
  type Message,
  type Middleware,
  type ModelEvent,
  type ModelResponse,
  type Tool,
  type ToolChoice,
} from "@sisu-ai/core";
import { logAndRethrow } from "@sisu-ai/mw-error-boundary";
import { withGuardrails } from "@sisu-ai/mw-guardrails";
import { toolCallInvariant } from "@sisu-ai/mw-invariants";
import {
  PROTOCOL_VERSION,
  chatGenerateRequestSchema,
  defaultModelConfigSchema,
  parseBranchThreadRequest,
  parseSetThreadModelOverrideRequest,
  type BranchThreadResponse,
  type ChatGenerateRequest,
  type ChatStreamAcceptedResponse,
  type DefaultModelConfig,
  type ErrorEnvelope,
  type MessageStatus,
  type ProviderCatalogResponse,
  type ProviderModel,
  type RuntimeDependencyStatus,
  type RuntimeHealthResponse,
  type RuntimeLifecycleState,
  type RuntimeStreamEvent,
  type RuntimeStreamTerminalEvent,
  type SearchResponse,
  type StreamStatusResponse,
  type ThreadDetailResponse,
  type ThreadListResponse,
  type ThreadMessage,
  type ThreadSummary,
  type CancelStreamResponse,
} from "@sisu-ai/protocol";

export interface RuntimeProvider {
  id: string;
  displayName: string;
  models: ProviderModel[];
  createModel(modelId: string): LLM;
  checkHealth?(): Promise<{ status: "ok" | "failed"; reason?: string }>;
}

export interface RuntimeStorage {
  listThreads(limit: number, cursor?: string): Promise<ThreadListResponse>;
  getThread(
    threadId: string,
    limit: number,
    cursor?: string,
  ): Promise<ThreadDetailResponse | null>;
  createThread(input: {
    title?: string;
    providerId: string;
    modelId: string;
    sourceThreadId?: string;
    sourceMessageId?: string;
  }): Promise<ThreadSummary>;
  appendMessage(input: {
    threadId: string;
    role: ThreadMessage["role"];
    content: string;
    status: MessageStatus;
    providerId?: string;
    modelId?: string;
  }): Promise<ThreadMessage>;
  updateMessageStatus(input: {
    messageId: string;
    status: MessageStatus;
    content?: string;
    updatedAt?: string;
  }): Promise<ThreadMessage | null>;
  findMessage(messageId: string): Promise<ThreadMessage | null>;
  branchThread(input: {
    sourceMessageId: string;
    title?: string;
  }): Promise<ThreadSummary | null>;
  search(query: string, limit: number, cursor?: string): Promise<SearchResponse>;
  getDefaultModel(): Promise<DefaultModelConfig | null>;
  setDefaultModel(config: DefaultModelConfig): Promise<DefaultModelConfig>;
  setThreadOverride(input: {
    threadId: string;
    providerId: string;
    modelId: string;
  }): Promise<ThreadSummary | null>;
  listMessagesByStatus?(
    statuses: MessageStatus[],
  ): Promise<Array<Pick<ThreadMessage, "messageId" | "status">>>;
}

export interface StreamRecord {
  streamId: string;
  messageId: string;
  threadId: string;
  status: StreamStatusResponse["status"];
  correlationId: string;
  request: ChatGenerateRequest;
  createdAt: string;
  updatedAt: string;
  terminalEvent?: RuntimeStreamTerminalEvent;
}

export interface RuntimeStatus {
  protocolVersion: typeof PROTOCOL_VERSION;
  state: RuntimeLifecycleState;
  degradedCapabilities: string[];
  dependencies: RuntimeDependencyStatus[];
}

export interface RuntimeController {
  status(): RuntimeStatus;
  start(): Promise<RuntimeStatus>;
  stop(): Promise<RuntimeStatus>;
  setDependencyStatus(
    dependencyId: string,
    status: RuntimeDependencyStatus["status"],
    reason?: string,
  ): RuntimeStatus;
  setProviderCatalog(providerCatalog: RuntimeProvider[]): RuntimeStatus;
  listProviders(): ProviderCatalogResponse;
  setDefaultModel(config: DefaultModelConfig): Promise<DefaultModelConfig>;
  getDefaultModel(): Promise<DefaultModelConfig | null>;
  createThread(input: {
    title?: string;
    providerId?: string;
    modelId?: string;
  }): Promise<ThreadSummary>;
  listThreads(limit?: number, cursor?: string): Promise<ThreadListResponse>;
  getThread(
    threadId: string,
    limit?: number,
    cursor?: string,
  ): Promise<ThreadDetailResponse | null>;
  searchHistory(query: string, limit?: number, cursor?: string): Promise<SearchResponse>;
  branchThread(input: { sourceMessageId: string; title?: string }): Promise<BranchThreadResponse>;
  setThreadModelOverride(input: {
    threadId: string;
    providerId: string;
    modelId: string;
  }): Promise<ThreadSummary>;
  generate(input: unknown): Promise<ChatStreamAcceptedResponse>;
  cancelStream(streamId: string): Promise<CancelStreamResponse>;
  getStreamStatus(streamId: string): Promise<StreamStatusResponse | null>;
  streamEvents(streamId: string): AsyncIterable<RuntimeStreamEvent>;
  health(): RuntimeHealthResponse;
}

export interface RuntimeHttpServerOptions {
  host?: string;
  port?: number;
  apiKey?: string;
  maxBodyBytes?: number;
  logger?: RuntimeLogger;
}

export interface RuntimeHttpServer {
  start(): Promise<{ host: string; port: number }>;
  stop(): Promise<void>;
  address(): AddressInfo | string | null;
}

export interface RuntimeProviderFactoryOptions {
  openAI?: {
    apiKey?: string;
    baseUrl?: string;
    models?: string[];
  };
  anthropic?: {
    apiKey?: string;
    baseUrl?: string;
    models?: string[];
  };
  ollama?: {
    baseUrl?: string;
    models?: string[];
  };
}

export interface RuntimeLogger {
  debug(message: string, attrs?: Record<string, unknown>): void;
  info(message: string, attrs?: Record<string, unknown>): void;
  warn(message: string, attrs?: Record<string, unknown>): void;
  error(message: string, attrs?: Record<string, unknown>): void;
}

export interface RuntimeChatPipelineHooks {
  beforePipeline?: Middleware<Ctx>;
  afterPipeline?: Middleware<Ctx>;
}

export interface CreateRuntimeControllerOptions {
  initialState?: RuntimeLifecycleState;
  dependencies?: RuntimeDependencyStatus[];
  degradedCapabilities?: string[];
  providers?: RuntimeProvider[];
  logger?: RuntimeLogger;
  storage?: RuntimeStorage;
  tools?: Tool[];
  hooks?: RuntimeChatPipelineHooks;
  guardrailPolicy?: (msg: string) => Promise<string | null>;
}

type StreamEventMap = {
  event: RuntimeStreamEvent;
  close: { streamId: string };
};

class TypedStreamEmitter {
  private readonly emitter = new EventEmitter();

  emit<K extends keyof StreamEventMap>(event: K, payload: StreamEventMap[K]): void {
    this.emitter.emit(event, payload);
  }

  on<K extends keyof StreamEventMap>(
    event: K,
    handler: (payload: StreamEventMap[K]) => void,
  ): () => void {
    this.emitter.on(event, handler);
    return () => this.emitter.off(event, handler);
  }
}

interface ThreadRecord {
  summary: ThreadSummary;
  messageIds: string[];
}

interface RuntimeStorageRecord {
  threads: Map<string, ThreadRecord>;
  messages: Map<string, ThreadMessage>;
  orderedThreadIds: string[];
  defaults: DefaultModelConfig | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function fallbackLogger(): RuntimeLogger {
  return {
    debug: (message, attrs) => {
      if (attrs) process.stderr.write(`[runtime-desktop] ${message} ${JSON.stringify(attrs)}\n`);
    },
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

function normalizeTitleFromPrompt(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) return "New chat";
  return trimmed.length > 48 ? `${trimmed.slice(0, 45)}...` : trimmed;
}

function computeState(
  currentState: RuntimeLifecycleState,
  dependencies: RuntimeDependencyStatus[],
): RuntimeLifecycleState {
  if (currentState === "stopped") return "stopped";
  const hasFailure = dependencies.some((d) => d.status === "failed");
  return hasFailure ? "degraded" : "ready";
}

function providerModelOrThrow(
  providers: RuntimeProvider[],
  providerId: string,
  modelId: string,
): { provider: RuntimeProvider; model: ProviderModel } {
  const provider = providers.find((p) => p.id === providerId);
  if (!provider) {
    throw createRuntimeErrorEnvelope("provider_unavailable", `Provider '${providerId}' is not available`, {
      providerId,
    });
  }
  const model = provider.models.find((m) => m.modelId === modelId);
  if (!model) {
    throw createRuntimeErrorEnvelope("model_unavailable", `Model '${modelId}' is not available`, {
      providerId,
      modelId,
    });
  }
  return { provider, model };
}

function createRuntimeErrorEnvelope(
  code: ErrorEnvelope["error"]["code"],
  message: string,
  details?: unknown,
): ErrorEnvelope {
  return {
    protocolVersion: PROTOCOL_VERSION,
    error: {
      code,
      message,
      details,
    },
  };
}

function asErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function createAbortError(): Error {
  const err = new Error("The operation was aborted.");
  err.name = "AbortError";
  return err;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

function buildProviderCatalog(providers: RuntimeProvider[]): ProviderCatalogResponse {
  return {
    protocolVersion: PROTOCOL_VERSION,
    providers: providers.map((provider) => ({
      providerId: provider.id,
      displayName: provider.displayName,
      models: provider.models,
    })),
  };
}

function makeMemoryStorage(logger: RuntimeLogger): RuntimeStorage {
  const record: RuntimeStorageRecord = {
    threads: new Map(),
    messages: new Map(),
    orderedThreadIds: [],
    defaults: null,
  };

  return {
    async listThreads(limit: number, cursor?: string): Promise<ThreadListResponse> {
      const offset = cursor ? Number(cursor) : 0;
      const ids = record.orderedThreadIds.slice(offset, offset + limit);
      const items = ids
        .map((id) => record.threads.get(id)?.summary)
        .filter((v): v is ThreadSummary => Boolean(v));
      const nextOffset = offset + ids.length;
      return {
        protocolVersion: PROTOCOL_VERSION,
        items,
        page: {
          nextCursor:
            nextOffset < record.orderedThreadIds.length ? String(nextOffset) : undefined,
        },
      };
    },
    async getThread(
      threadId: string,
      limit: number,
      cursor?: string,
    ): Promise<ThreadDetailResponse | null> {
      const thread = record.threads.get(threadId);
      if (!thread) return null;
      const offset = cursor ? Number(cursor) : 0;
      const messageIds = thread.messageIds.slice(offset, offset + limit);
      const messages = messageIds
        .map((messageId) => record.messages.get(messageId))
        .filter((v): v is ThreadMessage => Boolean(v));
      const nextOffset = offset + messageIds.length;
      return {
        protocolVersion: PROTOCOL_VERSION,
        thread: thread.summary,
        messages,
        page: {
          nextCursor:
            nextOffset < thread.messageIds.length ? String(nextOffset) : undefined,
        },
      };
    },
    async createThread(input) {
      const ts = nowIso();
      const threadId = randomUUID();
      const summary: ThreadSummary = {
        threadId,
        title: input.title ?? "New chat",
        createdAt: ts,
        updatedAt: ts,
        messageCount: 0,
        providerId: input.providerId,
        modelId: input.modelId,
        sourceThreadId: input.sourceThreadId,
        sourceMessageId: input.sourceMessageId,
      };
      record.threads.set(threadId, { summary, messageIds: [] });
      record.orderedThreadIds.unshift(threadId);
      return summary;
    },
    async appendMessage(input) {
      const ts = nowIso();
      const thread = record.threads.get(input.threadId);
      if (!thread) throw new Error(`Unknown thread: ${input.threadId}`);
      const message: ThreadMessage = {
        messageId: randomUUID(),
        threadId: input.threadId,
        role: input.role,
        content: input.content,
        status: input.status,
        providerId: input.providerId,
        modelId: input.modelId,
        createdAt: ts,
        updatedAt: ts,
      };
      record.messages.set(message.messageId, message);
      thread.messageIds.push(message.messageId);
      thread.summary.updatedAt = ts;
      thread.summary.messageCount = thread.messageIds.length;
      return message;
    },
    async updateMessageStatus(input) {
      const found = record.messages.get(input.messageId);
      if (!found) return null;
      const updatedAt = input.updatedAt ?? nowIso();
      const next: ThreadMessage = {
        ...found,
        status: input.status,
        content: input.content ?? found.content,
        updatedAt,
      };
      record.messages.set(input.messageId, next);
      const thread = record.threads.get(found.threadId);
      if (thread) {
        thread.summary.updatedAt = updatedAt;
      }
      return next;
    },
    async findMessage(messageId) {
      return record.messages.get(messageId) ?? null;
    },
    async branchThread(input) {
      const source = record.messages.get(input.sourceMessageId);
      if (!source) return null;
      const sourceThread = record.threads.get(source.threadId);
      if (!sourceThread) return null;
      const branchTitle = input.title ?? `${sourceThread.summary.title} (branch)`;
      const branch = await this.createThread({
        title: branchTitle,
        providerId: sourceThread.summary.providerId,
        modelId: sourceThread.summary.modelId,
        sourceThreadId: source.threadId,
        sourceMessageId: source.messageId,
      });
      const sourceIndex = sourceThread.messageIds.findIndex(
        (id) => id === source.messageId,
      );
      const replayIds =
        sourceIndex >= 0
          ? sourceThread.messageIds.slice(0, sourceIndex + 1)
          : sourceThread.messageIds;
      for (const id of replayIds) {
        const message = record.messages.get(id);
        if (!message) continue;
        await this.appendMessage({
          threadId: branch.threadId,
          role: message.role,
          content: message.content,
          status: message.status,
          providerId: message.providerId,
          modelId: message.modelId,
        });
      }
      const branched = record.threads.get(branch.threadId);
      if (!branched) return null;
      return branched.summary;
    },
    async search(query, limit, cursor): Promise<SearchResponse> {
      const normalized = query.trim().toLowerCase();
      const offset = cursor ? Number(cursor) : 0;
      const all = [...record.messages.values()]
        .filter(
          (m) =>
            m.content.toLowerCase().includes(normalized) ||
            record.threads.get(m.threadId)?.summary.title
              .toLowerCase()
              .includes(normalized),
        )
        .map((m) => ({
          threadId: m.threadId,
          messageId: m.messageId,
          excerpt: m.content.slice(0, 160),
          score: 1,
        }));
      const items = all.slice(offset, offset + limit);
      const nextOffset = offset + items.length;
      return {
        protocolVersion: PROTOCOL_VERSION,
        query,
        items,
        page: {
          nextCursor: nextOffset < all.length ? String(nextOffset) : undefined,
        },
      };
    },
    async getDefaultModel() {
      return record.defaults;
    },
    async setDefaultModel(config) {
      record.defaults = { ...config };
      logger.info("default_model.updated", config);
      return { ...config };
    },
    async setThreadOverride(input) {
      const thread = record.threads.get(input.threadId);
      if (!thread) return null;
      const ts = nowIso();
      thread.summary.providerId = input.providerId;
      thread.summary.modelId = input.modelId;
      thread.summary.updatedAt = ts;
      return thread.summary;
    },
    async listMessagesByStatus(statuses) {
      return [...record.messages.values()]
        .filter((message) => statuses.includes(message.status))
        .map((message) => ({
          messageId: message.messageId,
          status: message.status,
        }));
    },
  };
}

function findAssistantResult(messages: Message[]): string {
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  return lastAssistant?.content ?? "";
}

function isAsyncModelEvents(value: unknown): value is AsyncIterable<ModelEvent> {
  return (
    Boolean(value) &&
    typeof (value as AsyncIterable<ModelEvent>)[Symbol.asyncIterator] === "function"
  );
}

function createStreamingModelBridge(
  model: LLM,
  emit: (event: RuntimeStreamEvent) => void,
  streamId: string,
  messageId: string,
  correlationId: string,
  signal: AbortSignal,
): LLM {
  const generate = ((
    messages: Message[],
    opts?: import("@sisu-ai/core").GenerateOptions,
  ): Promise<ModelResponse> | AsyncIterable<ModelEvent> => {
    const nextOpts = { ...(opts ?? {}), stream: true, signal };
    const output = model.generate(messages, nextOpts);
    if (isAsyncModelEvents(output)) {
      const src = output;
      return (async function* () {
        let tokenIndex = 0;
        let completeText = "";
        for await (const ev of src) {
          if (ev.type === "token") {
            completeText += ev.token;
            emit({
              type: "token.delta",
              streamId,
              messageId,
              ts: nowIso(),
              correlationId,
              index: tokenIndex,
              delta: ev.token,
            });
            tokenIndex += 1;
          }
          if (ev.type === "assistant_message") {
            completeText = ev.message.content;
          }
          yield ev;
        }
        if (!completeText) {
          emit({
            type: "message.completed",
            streamId,
            messageId,
            ts: nowIso(),
            correlationId,
            text: "",
          });
        }
      })();
    }
    return (async () => {
      const resolved = await output;
      const text = resolved.message.content ?? "";
      emit({
        type: "token.delta",
        streamId,
        messageId,
        ts: nowIso(),
        correlationId,
        index: 0,
        delta: text,
      });
      return resolved;
    })();
  }) as LLM["generate"];

  return {
    ...model,
    generate,
  };
}

function makeRuntimeCtx(
  model: LLM,
  input: string,
  tools: Tool[],
  signal: AbortSignal,
  logger: RuntimeLogger,
): Ctx {
  const coreLogger: Logger = {
    debug: (...args: unknown[]) =>
      logger.debug(String(args[0] ?? ""), { args: args.slice(1) }),
    info: (...args: unknown[]) =>
      logger.info(String(args[0] ?? ""), { args: args.slice(1) }),
    warn: (...args: unknown[]) =>
      logger.warn(String(args[0] ?? ""), { args: args.slice(1) }),
    error: (...args: unknown[]) =>
      logger.error(String(args[0] ?? ""), { args: args.slice(1) }),
    span: () => {},
  };
  const ctx = createCtx({
    model,
    input,
    signal,
  });
  for (const tool of tools) {
    ctx.tools.register(tool);
  }
  ctx.memory = new InMemoryKV();
  ctx.log = coreLogger;
  return ctx;
}

function parseCursor(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return raw.trim() ? raw : undefined;
}

export function isLocalAddress(address: string | undefined): boolean {
  if (!address) return false;
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1"
  );
}

function toHttpError(err: unknown): ErrorEnvelope {
  if (
    typeof err === "object" &&
    err !== null &&
    "error" in err &&
    typeof (err as { error?: unknown }).error === "object"
  ) {
    const envelope = err as ErrorEnvelope;
    if (
      envelope.protocolVersion === PROTOCOL_VERSION &&
      envelope.error &&
      typeof envelope.error.code === "string"
    ) {
      return envelope;
    }
  }
  return createRuntimeErrorEnvelope("internal_error", asErrorMessage(err));
}

function statusCodeFromError(code: ErrorEnvelope["error"]["code"]): number {
  if (code === "invalid_request") return 400;
  if (code === "not_found") return 404;
  if (code === "model_unavailable" || code === "model_incompatible") return 422;
  if (code === "provider_unavailable") return 503;
  return 500;
}

function parseLimit(rawValue: string | null, fallback: number): number {
  if (!rawValue) return fallback;
  const n = Number(rawValue);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

async function readJsonBody(
  req: http.IncomingMessage,
  maxBodyBytes: number,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > maxBodyBytes) {
      throw createRuntimeErrorEnvelope(
        "invalid_request",
        `Request body exceeds limit (${maxBodyBytes} bytes)`,
      );
    }
    chunks.push(buf);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw createRuntimeErrorEnvelope("invalid_request", "Body must be valid JSON");
  }
}

function writeJson(
  res: http.ServerResponse,
  statusCode: number,
  body: unknown,
  correlationId: string,
): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  res.setHeader("x-correlation-id", correlationId);
  res.end(JSON.stringify(body));
}

export function createRuntimeController(
  options: CreateRuntimeControllerOptions = {},
): RuntimeController {
  const logger = options.logger ?? fallbackLogger();
  let state: RuntimeLifecycleState = options.initialState ?? "stopped";
  let dependencies: RuntimeDependencyStatus[] = [...(options.dependencies ?? [])];
  let degradedCapabilities: string[] = [...(options.degradedCapabilities ?? [])];
  let providers: RuntimeProvider[] = [...(options.providers ?? [])];
  const storage = options.storage ?? makeMemoryStorage(logger);
  const streamEvents = new TypedStreamEmitter();
  const streams = new Map<string, StreamRecord>();
  const streamControllers = new Map<string, AbortController>();
  const tools = [...(options.tools ?? [])];

  const status = (): RuntimeStatus => ({
    protocolVersion: PROTOCOL_VERSION,
    state,
    degradedCapabilities: [...degradedCapabilities],
    dependencies: [...dependencies],
  });

  async function resolveModelSelection(input: {
    threadId?: string;
    providerId?: string;
    modelId?: string;
  }): Promise<{ providerId: string; modelId: string }> {
    if (input.providerId && input.modelId) {
      return { providerId: input.providerId, modelId: input.modelId };
    }
    if (input.threadId) {
      const thread = await storage.getThread(input.threadId, 1);
      if (thread) {
        return {
          providerId: thread.thread.providerId,
          modelId: thread.thread.modelId,
        };
      }
    }
    const defaults = await storage.getDefaultModel();
    if (defaults) return defaults;
    const fallbackProvider = providers[0];
    const fallbackModel = fallbackProvider?.models[0];
    if (!fallbackProvider || !fallbackModel) {
      throw createRuntimeErrorEnvelope(
        "provider_unavailable",
        "No providers or models are configured",
      );
    }
    return { providerId: fallbackProvider.id, modelId: fallbackModel.modelId };
  }

  async function ensureRuntimeReady(): Promise<void> {
    if (state === "stopped") {
      throw createRuntimeErrorEnvelope(
        "internal_error",
        "Runtime is stopped and cannot process requests",
      );
    }
  }

  async function pumpGeneration(
    streamId: string,
    request: ChatGenerateRequest,
    streamMessage: ThreadMessage,
  ): Promise<void> {
    const stream = streams.get(streamId);
    if (!stream) return;
    const controller = streamControllers.get(streamId);
    if (!controller) return;
    const correlationId = stream.correlationId;
    const streamingRecord: StreamRecord = {
      ...stream,
      status: "streaming",
      updatedAt: nowIso(),
    };
    streams.set(streamId, streamingRecord);
    await storage.updateMessageStatus({
      messageId: streamMessage.messageId,
      status: "streaming",
      updatedAt: nowIso(),
    });
    const startEvent: RuntimeStreamEvent = {
      type: "message.started",
      streamId,
      messageId: streamMessage.messageId,
      threadId: stream.threadId,
      ts: nowIso(),
      correlationId,
    };
    streamEvents.emit("event", startEvent);
    try {
      const selection = await resolveModelSelection({
        threadId: stream.threadId,
        providerId: request.providerId,
        modelId: request.modelId,
      });
      const { provider, model } = providerModelOrThrow(
        providers,
        selection.providerId,
        selection.modelId,
      );
      if (request.attachments?.length && !model.capabilities.imageInput) {
        throw createRuntimeErrorEnvelope(
          "model_incompatible",
          `Model '${model.modelId}' does not support image attachments`,
          { providerId: provider.id, modelId: model.modelId },
        );
      }
      const baseModel = provider.createModel(model.modelId);
      const bridgedModel = createStreamingModelBridge(
        baseModel,
        (ev) => streamEvents.emit("event", ev),
        streamId,
        streamMessage.messageId,
        correlationId,
        controller.signal,
      );
      const ctx = makeRuntimeCtx(
        bridgedModel,
        request.prompt,
        tools,
        controller.signal,
        logger,
      );
      const chain: Middleware<Ctx>[] = [];
      chain.push(logAndRethrow());
      if (options.guardrailPolicy) {
        chain.push(withGuardrails(options.guardrailPolicy));
      }
      chain.push(toolCallInvariant());
      if (options.hooks?.beforePipeline) chain.push(options.hooks.beforePipeline);
      chain.push(async (runtimeCtx, next) => {
        runtimeCtx.messages.push({
          role: "user",
          content: request.prompt,
        });
        const output = runtimeCtx.model.generate(runtimeCtx.messages, {
          stream: true,
          signal: runtimeCtx.signal,
          tools,
          toolChoice: "auto" as ToolChoice,
        });
        if (isAsyncModelEvents(output)) {
          for await (const ev of output) {
            if (ev.type === "assistant_message") {
              runtimeCtx.messages.push(ev.message);
            }
          }
        } else {
          const resolved = await output;
          runtimeCtx.messages.push(resolved.message);
        }
        await next();
      });
      if (options.hooks?.afterPipeline) chain.push(options.hooks.afterPipeline);
      await compose(chain)(ctx);
      const assistantText = findAssistantResult(ctx.messages);
      await storage.updateMessageStatus({
        messageId: streamMessage.messageId,
        status: "completed",
        content: assistantText,
        updatedAt: nowIso(),
      });
      const completedEvent: RuntimeStreamTerminalEvent = {
        type: "message.completed",
        streamId,
        messageId: streamMessage.messageId,
        ts: nowIso(),
        correlationId,
        text: assistantText,
      };
      streams.set(streamId, {
        ...stream,
        status: "completed",
        updatedAt: nowIso(),
        terminalEvent: completedEvent,
      });
      streamEvents.emit("event", completedEvent);
      streamEvents.emit("close", { streamId });
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted) {
        const cancelledEvent: RuntimeStreamTerminalEvent = {
          type: "message.cancelled",
          streamId,
          messageId: streamMessage.messageId,
          ts: nowIso(),
          correlationId,
          reason: "cancelled_by_client",
        };
        await storage.updateMessageStatus({
          messageId: streamMessage.messageId,
          status: "cancelled",
          updatedAt: nowIso(),
        });
        streams.set(streamId, {
          ...stream,
          status: "cancelled",
          updatedAt: nowIso(),
          terminalEvent: cancelledEvent,
        });
        streamEvents.emit("event", cancelledEvent);
        streamEvents.emit("close", { streamId });
      } else {
        const errorEnvelope = (err as ErrorEnvelope)?.error
          ? (err as ErrorEnvelope)
          : createRuntimeErrorEnvelope(
              "internal_error",
              asErrorMessage(err),
            );
        const failedEvent: RuntimeStreamTerminalEvent = {
          type: "message.failed",
          streamId,
          messageId: streamMessage.messageId,
          ts: nowIso(),
          correlationId,
          error: errorEnvelope.error,
        };
        await storage.updateMessageStatus({
          messageId: streamMessage.messageId,
          status: "failed",
          updatedAt: nowIso(),
        });
        streams.set(streamId, {
          ...stream,
          status: "failed",
          updatedAt: nowIso(),
          terminalEvent: failedEvent,
        });
        streamEvents.emit("event", failedEvent);
        streamEvents.emit("close", { streamId });
      }
    }
  }

  return {
    status,
    async start() {
      state = "starting";
      for (const provider of providers) {
        if (!provider.checkHealth) continue;
        const health = await provider.checkHealth();
        const idx = dependencies.findIndex((d) => d.id === provider.id);
        const dependency: RuntimeDependencyStatus = {
          id: provider.id,
          status: health.status,
          reason: health.reason,
        };
        if (idx === -1) dependencies.push(dependency);
        else dependencies[idx] = dependency;
      }
      state = computeState("ready", dependencies);
      if (state === "degraded" && degradedCapabilities.length === 0) {
        degradedCapabilities = ["provider.availability"];
      }
      const recovering = storage.listMessagesByStatus
        ? await storage.listMessagesByStatus(["pending", "streaming"])
        : [];
      for (const message of recovering) {
        await storage.updateMessageStatus({
          messageId: message.messageId,
          status: "cancelled",
          updatedAt: nowIso(),
          content:
            message.status === "pending"
              ? "Interrupted before generation started"
              : "Interrupted during runtime restart",
        });
      }
      if (recovering.length > 0 && !degradedCapabilities.includes("recovery.pending")) {
        degradedCapabilities = [...degradedCapabilities, "recovery.pending"];
      }
      return status();
    },
    async stop() {
      state = "stopped";
      for (const [, controller] of streamControllers) controller.abort();
      streamControllers.clear();
      return status();
    },
    setDependencyStatus(dependencyId, dependencyState, reason) {
      const idx = dependencies.findIndex((d) => d.id === dependencyId);
      const next: RuntimeDependencyStatus = {
        id: dependencyId,
        status: dependencyState,
        reason,
      };
      if (idx === -1) dependencies.push(next);
      else dependencies[idx] = next;
      if (state !== "stopped") state = computeState("ready", dependencies);
      return status();
    },
    setProviderCatalog(providerCatalog: RuntimeProvider[]) {
      providers = [...providerCatalog];
      return status();
    },
    listProviders() {
      return buildProviderCatalog(providers);
    },
    async setDefaultModel(config) {
      providerModelOrThrow(providers, config.providerId, config.modelId);
      return storage.setDefaultModel(config);
    },
    async getDefaultModel() {
      return storage.getDefaultModel();
    },
    async createThread(input) {
      const selection = await resolveModelSelection({
        providerId: input.providerId,
        modelId: input.modelId,
      });
      providerModelOrThrow(providers, selection.providerId, selection.modelId);
      return storage.createThread({
        title: input.title,
        providerId: selection.providerId,
        modelId: selection.modelId,
      });
    },
    async listThreads(limit = 20, cursor) {
      return storage.listThreads(limit, parseCursor(cursor));
    },
    async getThread(threadId, limit = 100, cursor) {
      return storage.getThread(threadId, limit, parseCursor(cursor));
    },
    async searchHistory(query, limit = 20, cursor) {
      if (!query.trim()) {
        throw createRuntimeErrorEnvelope("invalid_request", "Query cannot be empty");
      }
      return storage.search(query, limit, parseCursor(cursor));
    },
    async branchThread(input) {
      const parsed = parseBranchThreadRequest(input);
      const branched = await storage.branchThread(parsed);
      if (!branched) {
        throw createRuntimeErrorEnvelope(
          "not_found",
          `Cannot branch from message '${parsed.sourceMessageId}'`,
        );
      }
      return {
        protocolVersion: PROTOCOL_VERSION,
        thread: branched,
      };
    },
    async setThreadModelOverride(input) {
      const parsed = parseSetThreadModelOverrideRequest(input);
      providerModelOrThrow(providers, parsed.providerId, parsed.modelId);
      const updated = await storage.setThreadOverride({
        threadId: input.threadId,
        providerId: parsed.providerId,
        modelId: parsed.modelId,
      });
      if (!updated) {
        throw createRuntimeErrorEnvelope(
          "not_found",
          `Thread '${input.threadId}' does not exist`,
        );
      }
      return updated;
    },
    async generate(input) {
      await ensureRuntimeReady();
      const request = chatGenerateRequestSchema.parse(input);
      const selection = await resolveModelSelection({
        threadId: request.threadId,
        providerId: request.providerId,
        modelId: request.modelId,
      });
      const { model } = providerModelOrThrow(
        providers,
        selection.providerId,
        selection.modelId,
      );
      if (request.attachments?.length && !model.capabilities.imageInput) {
        throw createRuntimeErrorEnvelope(
          "model_incompatible",
          `Model '${model.modelId}' does not support image attachments`,
          {
            providerId: selection.providerId,
            modelId: selection.modelId,
          },
        );
      }
      const threadId = request.threadId
        ? request.threadId
        : (
            await storage.createThread({
              title: normalizeTitleFromPrompt(request.prompt),
              providerId: selection.providerId,
              modelId: selection.modelId,
            })
          ).threadId;
      const userMessage = await storage.appendMessage({
        threadId,
        role: "user",
        content: request.prompt,
        status: "completed",
        providerId: selection.providerId,
        modelId: selection.modelId,
      });
      if (request.retryOfMessageId) {
        const retryMessage = await storage.findMessage(request.retryOfMessageId);
        if (!retryMessage) {
          throw createRuntimeErrorEnvelope(
            "not_found",
            `Retry source message '${request.retryOfMessageId}' not found`,
          );
        }
      }
      const assistantMessage = await storage.appendMessage({
        threadId,
        role: "assistant",
        content: "",
        status: "pending",
        providerId: selection.providerId,
        modelId: selection.modelId,
      });
      const streamId = randomUUID();
      const correlationId = randomUUID();
      const streamRecord: StreamRecord = {
        streamId,
        messageId: assistantMessage.messageId,
        threadId,
        status: "queued",
        correlationId,
        request: {
          ...request,
          providerId: selection.providerId,
          modelId: selection.modelId,
        },
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      streams.set(streamId, streamRecord);
      const controller = new AbortController();
      streamControllers.set(streamId, controller);
      void pumpGeneration(streamId, request, assistantMessage).finally(() => {
        streamControllers.delete(streamId);
      });
      logger.info("stream.started", {
        streamId,
        threadId,
        messageId: assistantMessage.messageId,
        correlationId,
        userMessageId: userMessage.messageId,
      });
      return {
        protocolVersion: PROTOCOL_VERSION,
        streamId,
        messageId: assistantMessage.messageId,
        status: "streaming",
      };
    },
    async cancelStream(streamId) {
      const stream = streams.get(streamId);
      if (!stream) {
        throw createRuntimeErrorEnvelope(
          "not_found",
          `Stream '${streamId}' does not exist`,
        );
      }
      if (
        stream.status === "completed" ||
        stream.status === "failed" ||
        stream.status === "cancelled"
      ) {
        return {
          protocolVersion: PROTOCOL_VERSION,
          streamId,
          status: stream.status === "completed" ? "completed" : "cancelled",
        };
      }
      const controller = streamControllers.get(streamId);
      if (controller) controller.abort();
      streams.set(streamId, {
        ...stream,
        status: "cancelled",
        updatedAt: nowIso(),
      });
      return {
        protocolVersion: PROTOCOL_VERSION,
        streamId,
        status: "cancelling",
      };
    },
    async getStreamStatus(streamId) {
      const stream = streams.get(streamId);
      if (!stream) return null;
      return {
        protocolVersion: PROTOCOL_VERSION,
        streamId: stream.streamId,
        messageId: stream.messageId,
        status: stream.status,
        terminalEvent: stream.terminalEvent,
      };
    },
    async *streamEvents(streamId) {
      const existing = streams.get(streamId);
      if (!existing) {
        throw createRuntimeErrorEnvelope(
          "not_found",
          `Stream '${streamId}' does not exist`,
        );
      }
      if (existing.terminalEvent) {
        yield {
          type: "message.started",
          streamId: existing.streamId,
          messageId: existing.messageId,
          threadId: existing.threadId,
          ts: existing.createdAt,
          correlationId: existing.correlationId,
        } as RuntimeStreamEvent;
        yield existing.terminalEvent;
        return;
      }
      const queue: RuntimeStreamEvent[] = [];
      let done = false;
      queue.push({
        type: "message.started",
        streamId: existing.streamId,
        messageId: existing.messageId,
        threadId: existing.threadId,
        ts: existing.createdAt,
        correlationId: existing.correlationId,
      } as RuntimeStreamEvent);
      const offEvent = streamEvents.on("event", (event) => {
        if (event.streamId === streamId) {
          queue.push(event);
        }
      });
      const offClose = streamEvents.on("close", (event) => {
        if (event.streamId === streamId) {
          done = true;
        }
      });
      try {
        while (!done || queue.length > 0) {
          if (queue.length === 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, 5));
            continue;
          }
          const next = queue.shift();
          if (next) yield next;
        }
      } finally {
        offEvent();
        offClose();
      }
    },
    health() {
      return {
        protocolVersion: PROTOCOL_VERSION,
        state,
        degradedCapabilities: [...new Set(degradedCapabilities)],
        dependencies: [...dependencies],
      };
    },
  };
}

export function simpleProvider(
  id: string,
  displayName: string,
  models: ProviderModel[],
  createModel: (modelId: string) => LLM,
): RuntimeProvider {
  return {
    id,
    displayName,
    models,
    createModel,
  };
}

function modelsOrDefault(models: string[] | undefined, fallback: string[]): string[] {
  if (!models || models.length === 0) return fallback;
  return models;
}

export function createDefaultProviders(
  opts: RuntimeProviderFactoryOptions = {},
): RuntimeProvider[] {
  const providers: RuntimeProvider[] = [];
  const openAiModels = modelsOrDefault(opts.openAI?.models, ["gpt-4o-mini"]);
  providers.push(
    simpleProvider(
      "openai",
      "OpenAI",
      openAiModels.map((modelId) => ({
        providerId: "openai",
        modelId,
        displayName: modelId,
        capabilities: {
          streaming: true,
          imageInput: true,
          toolCalling: true,
        },
      })),
      (modelId) =>
        openAIAdapter({
          model: modelId,
          apiKey: opts.openAI?.apiKey,
          baseUrl: opts.openAI?.baseUrl,
        }),
    ),
  );

  const anthropicModels = modelsOrDefault(opts.anthropic?.models, [
    "claude-sonnet-4-5",
  ]);
  providers.push(
    simpleProvider(
      "anthropic",
      "Anthropic",
      anthropicModels.map((modelId) => ({
        providerId: "anthropic",
        modelId,
        displayName: modelId,
        capabilities: {
          streaming: true,
          imageInput: true,
          toolCalling: true,
        },
      })),
      (modelId) =>
        anthropicAdapter({
          model: modelId,
          apiKey: opts.anthropic?.apiKey,
          baseUrl: opts.anthropic?.baseUrl,
        }),
    ),
  );

  const ollamaModels = modelsOrDefault(opts.ollama?.models, ["llama3.2"]);
  providers.push(
    simpleProvider(
      "ollama",
      "Ollama",
      ollamaModels.map((modelId) => ({
        providerId: "ollama",
        modelId,
        displayName: modelId,
        capabilities: {
          streaming: true,
          imageInput: true,
          toolCalling: true,
        },
      })),
      (modelId) =>
        ollamaAdapter({
          model: modelId,
          baseUrl: opts.ollama?.baseUrl,
        }),
    ),
  );

  return providers;
}

export function staticTextModel(name: string, text: string): LLM {
  const generate = ((
    messages: Message[],
    opts?: import("@sisu-ai/core").GenerateOptions,
  ): Promise<ModelResponse> | AsyncIterable<ModelEvent> => {
    void messages;
    const requestedStream = Boolean(opts?.stream);
    if (!requestedStream) {
      return Promise.resolve({
        message: { role: "assistant", content: text },
      });
    }
    return (async function* () {
      const tokens = text.split(/(\s+)/).filter(Boolean);
      for (const token of tokens) {
        if (opts?.signal?.aborted) {
          throw createAbortError();
        }
        yield { type: "token", token } as ModelEvent;
        await new Promise<void>((resolve) => setTimeout(resolve, 1));
      }
      yield {
        type: "assistant_message",
        message: { role: "assistant", content: text },
      } as ModelEvent;
    })();
  }) as LLM["generate"];

  return {
    name,
    capabilities: {
      functionCall: false,
      streaming: true,
    },
    generate,
  };
}

export function createRuntimeHttpServer(
  runtime: RuntimeController,
  options: RuntimeHttpServerOptions = {},
): RuntimeHttpServer {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const maxBodyBytes = options.maxBodyBytes ?? 1_000_000;
  const logger = options.logger ?? fallbackLogger();
  const apiKey = options.apiKey;
  let server: http.Server | undefined;

  const handler = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> => {
    const correlationId = randomUUID();
    const remoteAddress = req.socket.remoteAddress ?? "";
    if (!isLocalAddress(remoteAddress)) {
      writeJson(
        res,
        403,
        createRuntimeErrorEnvelope(
          "invalid_request",
          "Only localhost clients are allowed",
        ),
        correlationId,
      );
      logger.warn("http.reject.non_local", {
        correlationId,
        remoteAddress,
        method: req.method ?? "GET",
        url: req.url ?? "/",
      });
      return;
    }

    if (apiKey) {
      const auth = req.headers.authorization;
      if (auth !== `Bearer ${apiKey}`) {
        writeJson(
          res,
          401,
          createRuntimeErrorEnvelope("invalid_request", "Invalid authorization token"),
          correlationId,
        );
        return;
      }
    }

    const requestUrl = new URL(req.url ?? "/", "http://localhost");
    const path = requestUrl.pathname;
    const method = req.method ?? "GET";
    logger.info("http.request", {
      correlationId,
      method,
      path,
      remoteAddress,
    });

    try {
      if (method === "GET" && path === "/health") {
        writeJson(res, 200, runtime.health(), correlationId);
        return;
      }

      if (method === "GET" && path === "/providers") {
        writeJson(res, 200, runtime.listProviders(), correlationId);
        return;
      }

      if (method === "GET" && path === "/settings/default-model") {
        const config = await runtime.getDefaultModel();
        writeJson(
          res,
          200,
          {
            protocolVersion: PROTOCOL_VERSION,
            config,
          },
          correlationId,
        );
        return;
      }

      if (method === "PUT" && path === "/settings/default-model") {
        const body = await readJsonBody(req, maxBodyBytes);
        const parsed = defaultModelConfigSchema.parse(body);
        const config = await runtime.setDefaultModel(parsed);
        writeJson(
          res,
          200,
          {
            protocolVersion: PROTOCOL_VERSION,
            config,
          },
          correlationId,
        );
        return;
      }

      if (method === "POST" && path === "/threads") {
        const body = (await readJsonBody(req, maxBodyBytes)) as {
          title?: string;
          providerId?: string;
          modelId?: string;
        };
        const thread = await runtime.createThread(body);
        writeJson(
          res,
          201,
          {
            protocolVersion: PROTOCOL_VERSION,
            thread,
          },
          correlationId,
        );
        return;
      }

      if (method === "GET" && path === "/threads") {
        const cursor = requestUrl.searchParams.get("cursor") ?? undefined;
        const limit = parseLimit(requestUrl.searchParams.get("limit"), 20);
        const result = await runtime.listThreads(limit, cursor);
        writeJson(res, 200, result, correlationId);
        return;
      }

      if (method === "GET" && path.startsWith("/threads/")) {
        const threadId = path.slice("/threads/".length);
        const cursor = requestUrl.searchParams.get("cursor") ?? undefined;
        const limit = parseLimit(requestUrl.searchParams.get("limit"), 100);
        const thread = await runtime.getThread(threadId, limit, cursor);
        if (!thread) {
          writeJson(
            res,
            404,
            createRuntimeErrorEnvelope("not_found", `Thread '${threadId}' not found`),
            correlationId,
          );
          return;
        }
        writeJson(res, 200, thread, correlationId);
        return;
      }

      if (method === "POST" && path.endsWith("/override-model") && path.startsWith("/threads/")) {
        const threadId = path.slice("/threads/".length, -"/override-model".length);
        const body = await readJsonBody(req, maxBodyBytes);
        const parsed = parseSetThreadModelOverrideRequest(body);
        const updated = await runtime.setThreadModelOverride({
          threadId,
          providerId: parsed.providerId,
          modelId: parsed.modelId,
        });
        writeJson(
          res,
          200,
          {
            protocolVersion: PROTOCOL_VERSION,
            thread: updated,
          },
          correlationId,
        );
        return;
      }

      if (method === "GET" && path === "/search") {
        const query = requestUrl.searchParams.get("query") ?? "";
        const cursor = requestUrl.searchParams.get("cursor") ?? undefined;
        const limit = parseLimit(requestUrl.searchParams.get("limit"), 20);
        const result = await runtime.searchHistory(query, limit, cursor);
        writeJson(res, 200, result, correlationId);
        return;
      }

      if (method === "POST" && path === "/threads/branch") {
        const body = await readJsonBody(req, maxBodyBytes);
        const result = await runtime.branchThread(
          parseBranchThreadRequest(body),
        );
        writeJson(res, 201, result, correlationId);
        return;
      }

      if (method === "POST" && path === "/chat/generate") {
        const body = await readJsonBody(req, maxBodyBytes);
        const accepted = await runtime.generate(body);
        writeJson(res, 202, accepted, correlationId);
        return;
      }

      if (method === "POST" && path.startsWith("/streams/") && path.endsWith("/cancel")) {
        const streamId = path.slice("/streams/".length, -"/cancel".length);
        const cancelled = await runtime.cancelStream(streamId);
        writeJson(res, 202, cancelled, correlationId);
        return;
      }

      if (method === "GET" && path.startsWith("/streams/") && path.endsWith("/status")) {
        const streamId = path.slice("/streams/".length, -"/status".length);
        const status = await runtime.getStreamStatus(streamId);
        if (!status) {
          writeJson(
            res,
            404,
            createRuntimeErrorEnvelope("not_found", `Stream '${streamId}' not found`),
            correlationId,
          );
          return;
        }
        writeJson(res, 200, status, correlationId);
        return;
      }

      if (method === "GET" && path.startsWith("/streams/") && path.endsWith("/events")) {
        const streamId = path.slice("/streams/".length, -"/events".length);
        res.statusCode = 200;
        res.setHeader("content-type", "text/event-stream");
        res.setHeader("cache-control", "no-cache");
        res.setHeader("connection", "keep-alive");
        res.setHeader("x-correlation-id", correlationId);
        for await (const event of runtime.streamEvents(streamId)) {
          res.write(`event: ${event.type}\n`);
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
        res.end();
        return;
      }

      writeJson(
        res,
        404,
        createRuntimeErrorEnvelope(
          "not_found",
          `Route '${method} ${path}' is not defined`,
        ),
        correlationId,
      );
    } catch (err) {
      const envelope = toHttpError(err);
      logger.error("http.error", {
        correlationId,
        method,
        path,
        code: envelope.error.code,
        message: envelope.error.message,
      });
      writeJson(
        res,
        statusCodeFromError(envelope.error.code),
        envelope,
        correlationId,
      );
    }
  };

  return {
    async start() {
      if (server) {
        const addr = server.address();
        if (!addr || typeof addr === "string") {
          return { host, port };
        }
        return { host, port: addr.port };
      }
      await runtime.start();
      server = http.createServer((req, res) => {
        void handler(req, res);
      });
      await new Promise<void>((resolve, reject) => {
        server?.once("error", reject);
        server?.listen(port, host, () => resolve());
      });
      const addr = server.address();
      const activePort =
        addr && typeof addr !== "string" ? addr.port : port;
      logger.info("http.started", {
        host,
        port: activePort,
      });
      return { host, port: activePort };
    },
    async stop() {
      if (!server) return;
      const current = server;
      server = undefined;
      await new Promise<void>((resolve, reject) => {
        current.close((err) => (err ? reject(err) : resolve()));
      });
      await runtime.stop();
      logger.info("http.stopped", {});
    },
    address() {
      if (!server) return null;
      return server.address();
    },
  };
}

export const runtimeDesktopInternal = {
  makeMemoryStorage,
  createRuntimeErrorEnvelope,
  isLocalAddress,
};
