import { z } from "zod";

export const PROTOCOL_VERSION = "2026-03-29" as const;

export const runtimeLifecycleStateSchema = z.enum([
  "starting",
  "ready",
  "degraded",
  "stopped",
]);
export type RuntimeLifecycleState = z.infer<typeof runtimeLifecycleStateSchema>;

export const runtimeErrorCodeSchema = z.enum([
  "invalid_request",
  "not_found",
  "model_unavailable",
  "model_incompatible",
  "provider_unavailable",
  "stream_closed",
  "internal_error",
]);
export type RuntimeErrorCode = z.infer<typeof runtimeErrorCodeSchema>;

export const runtimeErrorSchema = z.object({
  code: runtimeErrorCodeSchema,
  message: z.string().min(1),
  details: z.unknown().optional(),
});
export type RuntimeErrorBody = z.infer<typeof runtimeErrorSchema>;

export const modelCapabilitySchema = z.object({
  streaming: z.boolean(),
  imageInput: z.boolean(),
  toolCalling: z.boolean(),
  contextWindow: z.number().int().positive().optional(),
});
export type ModelCapability = z.infer<typeof modelCapabilitySchema>;

export const providerModelSchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  displayName: z.string().min(1),
  capabilities: modelCapabilitySchema,
});
export type ProviderModel = z.infer<typeof providerModelSchema>;

export const providerCatalogResponseSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  providers: z.array(
    z.object({
      providerId: z.string().min(1),
      displayName: z.string().min(1),
      models: z.array(providerModelSchema),
    }),
  ),
});
export type ProviderCatalogResponse = z.infer<typeof providerCatalogResponseSchema>;

export const runtimeDependencyStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["ok", "failed"]),
  reason: z.string().optional(),
});
export type RuntimeDependencyStatus = z.infer<typeof runtimeDependencyStatusSchema>;

export const runtimeHealthResponseSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  state: runtimeLifecycleStateSchema,
  degradedCapabilities: z.array(z.string()).default([]),
  dependencies: z.array(runtimeDependencyStatusSchema).default([]),
});
export type RuntimeHealthResponse = z.infer<typeof runtimeHealthResponseSchema>;

export const chatGenerateRequestSchema = z.object({
  threadId: z.string().min(1).optional(),
  prompt: z.string().min(1),
  providerId: z.string().min(1).optional(),
  modelId: z.string().min(1),
  stream: z.boolean().optional(),
  retryOfMessageId: z.string().min(1).optional(),
  attachments: z
    .array(
      z.object({
        type: z.literal("image"),
        mimeType: z.string().min(1),
        data: z.string().min(1),
      }),
    )
    .optional(),
});
export type ChatGenerateRequest = z.infer<typeof chatGenerateRequestSchema>;

export const chatStreamAcceptedResponseSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  streamId: z.string().min(1),
  messageId: z.string().min(1),
  status: z.enum(["queued", "streaming"]),
});
export type ChatStreamAcceptedResponse = z.infer<
  typeof chatStreamAcceptedResponseSchema
>;

const streamEventBase = z.object({
  streamId: z.string().min(1),
  messageId: z.string().min(1),
  ts: z.string().datetime(),
  correlationId: z.string().min(1).optional(),
});

export const messageStartedEventSchema = streamEventBase.extend({
  type: z.literal("message.started"),
  threadId: z.string().min(1).optional(),
});
export type MessageStartedEvent = z.infer<typeof messageStartedEventSchema>;

export const tokenDeltaEventSchema = streamEventBase.extend({
  type: z.literal("token.delta"),
  index: z.number().int().nonnegative(),
  delta: z.string(),
});
export type TokenDeltaEvent = z.infer<typeof tokenDeltaEventSchema>;

export const messageCompletedEventSchema = streamEventBase.extend({
  type: z.literal("message.completed"),
  text: z.string(),
});
export type MessageCompletedEvent = z.infer<typeof messageCompletedEventSchema>;

export const messageFailedEventSchema = streamEventBase.extend({
  type: z.literal("message.failed"),
  error: runtimeErrorSchema,
});
export type MessageFailedEvent = z.infer<typeof messageFailedEventSchema>;

export const messageCancelledEventSchema = streamEventBase.extend({
  type: z.literal("message.cancelled"),
  reason: z.string().optional(),
});
export type MessageCancelledEvent = z.infer<typeof messageCancelledEventSchema>;

export const runtimeStreamTerminalEventSchema = z.discriminatedUnion("type", [
  messageCompletedEventSchema,
  messageFailedEventSchema,
  messageCancelledEventSchema,
]);
export type RuntimeStreamTerminalEvent = z.infer<
  typeof runtimeStreamTerminalEventSchema
>;

export const runtimeStreamEventSchema = z.discriminatedUnion("type", [
  messageStartedEventSchema,
  tokenDeltaEventSchema,
  messageCompletedEventSchema,
  messageFailedEventSchema,
  messageCancelledEventSchema,
]);
export type RuntimeStreamEvent = z.infer<typeof runtimeStreamEventSchema>;

export const streamStatusResponseSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  streamId: z.string().min(1),
  messageId: z.string().min(1),
  status: z.enum(["queued", "streaming", "completed", "failed", "cancelled"]),
  terminalEvent: runtimeStreamTerminalEventSchema.optional(),
});
export type StreamStatusResponse = z.infer<typeof streamStatusResponseSchema>;

export const cancelStreamResponseSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  streamId: z.string().min(1),
  status: z.enum(["cancelling", "cancelled", "completed"]),
});
export type CancelStreamResponse = z.infer<typeof cancelStreamResponseSchema>;

export const messageStatusSchema = z.enum([
  "pending",
  "streaming",
  "completed",
  "failed",
  "cancelled",
]);
export type MessageStatus = z.infer<typeof messageStatusSchema>;

export const roleSchema = z.enum(["system", "user", "assistant", "tool"]);
export type MessageRole = z.infer<typeof roleSchema>;

export const threadSummarySchema = z.object({
  threadId: z.string().min(1),
  title: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  messageCount: z.number().int().nonnegative(),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  sourceThreadId: z.string().min(1).optional(),
  sourceMessageId: z.string().min(1).optional(),
});
export type ThreadSummary = z.infer<typeof threadSummarySchema>;

export const threadMessageSchema = z.object({
  messageId: z.string().min(1),
  threadId: z.string().min(1),
  role: roleSchema,
  content: z.string(),
  status: messageStatusSchema,
  providerId: z.string().min(1).optional(),
  modelId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ThreadMessage = z.infer<typeof threadMessageSchema>;

export const paginationSchema = z.object({
  nextCursor: z.string().min(1).optional(),
});
export type Pagination = z.infer<typeof paginationSchema>;

export const threadListResponseSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  items: z.array(threadSummarySchema),
  page: paginationSchema,
});
export type ThreadListResponse = z.infer<typeof threadListResponseSchema>;

export const threadDetailResponseSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  thread: threadSummarySchema,
  messages: z.array(threadMessageSchema),
  page: paginationSchema,
});
export type ThreadDetailResponse = z.infer<typeof threadDetailResponseSchema>;

export const createThreadRequestSchema = z.object({
  title: z.string().min(1).optional(),
  providerId: z.string().min(1).optional(),
  modelId: z.string().min(1).optional(),
});
export type CreateThreadRequest = z.infer<typeof createThreadRequestSchema>;

export const createThreadResponseSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  thread: threadSummarySchema,
});
export type CreateThreadResponse = z.infer<typeof createThreadResponseSchema>;

export const branchThreadRequestSchema = z.object({
  sourceMessageId: z.string().min(1),
  title: z.string().min(1).optional(),
});
export type BranchThreadRequest = z.infer<typeof branchThreadRequestSchema>;

export const branchThreadResponseSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  thread: threadSummarySchema,
});
export type BranchThreadResponse = z.infer<typeof branchThreadResponseSchema>;

export const searchResultSchema = z.object({
  threadId: z.string().min(1),
  messageId: z.string().min(1),
  excerpt: z.string().min(1),
  score: z.number().nonnegative(),
});
export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchResponseSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  query: z.string().min(1),
  items: z.array(searchResultSchema),
  page: paginationSchema,
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

export const defaultModelConfigSchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1),
});
export type DefaultModelConfig = z.infer<typeof defaultModelConfigSchema>;

export const getDefaultModelResponseSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  config: defaultModelConfigSchema,
});
export type GetDefaultModelResponse = z.infer<typeof getDefaultModelResponseSchema>;

export const setThreadModelOverrideRequestSchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1),
});
export type SetThreadModelOverrideRequest = z.infer<
  typeof setThreadModelOverrideRequestSchema
>;

export const errorEnvelopeSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  error: runtimeErrorSchema,
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export function parseChatGenerateRequest(input: unknown): ChatGenerateRequest {
  return chatGenerateRequestSchema.parse(input);
}

export function parseRuntimeStreamEvent(input: unknown): RuntimeStreamEvent {
  return runtimeStreamEventSchema.parse(input);
}

export function parseSetThreadModelOverrideRequest(
  input: unknown,
): SetThreadModelOverrideRequest {
  return setThreadModelOverrideRequestSchema.parse(input);
}

export function parseBranchThreadRequest(input: unknown): BranchThreadRequest {
  return branchThreadRequestSchema.parse(input);
}
