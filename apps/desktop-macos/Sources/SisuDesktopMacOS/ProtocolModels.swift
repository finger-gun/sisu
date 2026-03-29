import Foundation

struct RuntimeErrorBody: Codable, Identifiable {
    let code: String
    let message: String
    let details: String?

    var id: String { "\(code):\(message)" }
}

struct RuntimeErrorEnvelope: Codable {
    let protocolVersion: String
    let error: RuntimeErrorBody
}

struct ModelCapabilities: Codable {
    let streaming: Bool
    let imageInput: Bool
    let toolCalling: Bool
    let contextWindow: Int?
}

struct ProviderModel: Codable, Identifiable {
    let providerId: String
    let modelId: String
    let displayName: String
    let capabilities: ModelCapabilities

    var id: String { "\(providerId):\(modelId)" }
}

struct ProviderCatalogEntry: Codable, Identifiable {
    let providerId: String
    let displayName: String
    let models: [ProviderModel]

    var id: String { providerId }
}

struct ProviderCatalogResponse: Codable {
    let protocolVersion: String
    let providers: [ProviderCatalogEntry]
}

struct RuntimeDependencyStatus: Codable, Identifiable {
    let id: String
    let status: String
    let reason: String?
}

struct RuntimeHealthResponse: Codable {
    let protocolVersion: String
    let state: String
    let degradedCapabilities: [String]
    let dependencies: [RuntimeDependencyStatus]
}

struct Pagination: Codable {
    let nextCursor: String?
}

struct ThreadSummary: Codable, Identifiable {
    let threadId: String
    let title: String
    let createdAt: String
    let updatedAt: String
    let messageCount: Int
    let providerId: String
    let modelId: String
    let sourceThreadId: String?
    let sourceMessageId: String?

    var id: String { threadId }
}

struct ThreadListResponse: Codable {
    let protocolVersion: String
    let items: [ThreadSummary]
    let page: Pagination
}

struct ThreadMessage: Codable, Identifiable {
    let messageId: String
    let threadId: String
    let role: String
    let content: String
    let status: String
    let providerId: String?
    let modelId: String?
    let createdAt: String
    let updatedAt: String

    var id: String { messageId }
}

struct ThreadDetailResponse: Codable {
    let protocolVersion: String
    let thread: ThreadSummary
    let messages: [ThreadMessage]
    let page: Pagination
}

struct SearchResultItem: Codable, Identifiable {
    let threadId: String
    let messageId: String
    let excerpt: String
    let score: Double

    var id: String { "\(threadId):\(messageId)" }
}

struct SearchResponse: Codable {
    let protocolVersion: String
    let query: String
    let items: [SearchResultItem]
    let page: Pagination
}

struct BranchThreadRequest: Codable {
    let sourceMessageId: String
    let title: String?
}

struct BranchThreadResponse: Codable {
    let protocolVersion: String
    let thread: ThreadSummary
}

struct SetThreadModelOverrideRequest: Codable {
    let providerId: String
    let modelId: String
}

struct CreateThreadRequest: Codable {
    let title: String?
    let providerId: String?
    let modelId: String?
}

struct CreateThreadResponse: Codable {
    let protocolVersion: String
    let thread: ThreadSummary
}

struct ChatAttachment: Codable {
    let type: String
    let mimeType: String
    let data: String
}

struct ChatGenerateRequest: Codable {
    let threadId: String?
    let prompt: String
    let providerId: String?
    let modelId: String
    let stream: Bool
    let retryOfMessageId: String?
    let attachments: [ChatAttachment]?
}

struct ChatStreamAcceptedResponse: Codable {
    let protocolVersion: String
    let streamId: String
    let messageId: String
    let status: String
}

struct StreamStatusResponse: Codable {
    let protocolVersion: String
    let streamId: String
    let messageId: String
    let status: String
}

struct DefaultModelConfig: Codable {
    let providerId: String
    let modelId: String
}

struct DefaultModelResponse: Codable {
    let protocolVersion: String
    let config: DefaultModelConfig?
}

struct RuntimeStreamEvent: Decodable, Identifiable {
    let type: String
    let streamId: String
    let messageId: String
    let ts: String
    let correlationId: String?
    let threadId: String?
    let index: Int?
    let delta: String?
    let text: String?
    let reason: String?
    let error: RuntimeErrorBody?

    var id: String { "\(streamId):\(messageId):\(ts):\(type):\(index ?? -1)" }
}
