import Foundation

enum RuntimeClientError: Error, LocalizedError {
    case invalidResponse
    case httpError(RuntimeErrorBody)
    case decodeFailed
    case transport(String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid response from runtime"
        case .httpError(let body):
            return "\(body.code): \(body.message)"
        case .decodeFailed:
            return "Could not decode runtime response"
        case .transport(let message):
            return message
        }
    }
}

final class RuntimeClient {
    private let baseURL: URL
    private let session: URLSession
    private let jsonDecoder = JSONDecoder()
    private let jsonEncoder = JSONEncoder()
    private let authToken: String?

    init(baseURL: URL, authToken: String? = nil, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.authToken = authToken
        self.session = session
    }

    func health() async throws -> RuntimeHealthResponse {
        try await request(path: "/health", method: "GET", body: Optional<String>.none)
    }

    func providers() async throws -> ProviderCatalogResponse {
        try await request(path: "/providers", method: "GET", body: Optional<String>.none)
    }

    func listThreads(limit: Int = 30, cursor: String? = nil) async throws -> ThreadListResponse {
        var path = "/threads?limit=\(limit)"
        if let cursor {
            path += "&cursor=\(cursor)"
        }
        return try await request(path: path, method: "GET", body: Optional<String>.none)
    }

    func getThread(threadId: String) async throws -> ThreadDetailResponse {
        try await request(path: "/threads/\(threadId)", method: "GET", body: Optional<String>.none)
    }

    func createThread(_ requestBody: CreateThreadRequest) async throws -> CreateThreadResponse {
        try await request(path: "/threads", method: "POST", body: requestBody)
    }

    func search(query: String, limit: Int = 30) async throws -> SearchResponse {
        let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        return try await request(path: "/search?query=\(encoded)&limit=\(limit)", method: "GET", body: Optional<String>.none)
    }

    func branchThread(_ payload: BranchThreadRequest) async throws -> BranchThreadResponse {
        try await request(path: "/threads/branch", method: "POST", body: payload)
    }

    func setThreadOverride(threadId: String, providerId: String, modelId: String) async throws -> ThreadSummary {
        let response: ThreadEnvelopeResponse = try await request(
            path: "/threads/\(threadId)/override-model",
            method: "POST",
            body: SetThreadModelOverrideRequest(providerId: providerId, modelId: modelId)
        )
        return response.thread
    }

    func getDefaultModel() async throws -> DefaultModelResponse {
        try await request(path: "/settings/default-model", method: "GET", body: Optional<String>.none)
    }

    func setDefaultModel(providerId: String, modelId: String) async throws -> DefaultModelResponse {
        try await request(
            path: "/settings/default-model",
            method: "PUT",
            body: DefaultModelConfig(providerId: providerId, modelId: modelId)
        )
    }

    func generate(_ requestBody: ChatGenerateRequest) async throws -> ChatStreamAcceptedResponse {
        try await request(path: "/chat/generate", method: "POST", body: requestBody)
    }

    func cancel(streamId: String) async throws -> StreamStatusResponse {
        try await request(path: "/streams/\(streamId)/cancel", method: "POST", body: Optional<String>.none)
    }

    func streamStatus(streamId: String) async throws -> StreamStatusResponse {
        try await request(path: "/streams/\(streamId)/status", method: "GET", body: Optional<String>.none)
    }

    func streamEvents(streamId: String) -> AsyncThrowingStream<RuntimeStreamEvent, Error> {
        AsyncThrowingStream { continuation in
            Task {
                do {
                    var request = URLRequest(url: baseURL.appending(path: "/streams/\(streamId)/events"))
                    request.httpMethod = "GET"
                    if let authToken {
                        request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
                    }

                    let (bytes, response) = try await session.bytes(for: request)
                    guard let http = response as? HTTPURLResponse else {
                        throw RuntimeClientError.invalidResponse
                    }
                    guard (200..<300).contains(http.statusCode) else {
                        throw RuntimeClientError.transport("Streaming request failed with status \(http.statusCode)")
                    }

                    for try await line in bytes.lines {
                        if !line.hasPrefix("data: ") { continue }
                        let payload = String(line.dropFirst(6))
                        guard let data = payload.data(using: .utf8) else { continue }
                        do {
                            let event = try jsonDecoder.decode(RuntimeStreamEvent.self, from: data)
                            continuation.yield(event)
                            if event.type == "message.completed" || event.type == "message.failed" || event.type == "message.cancelled" {
                                continuation.finish()
                                return
                            }
                        } catch {
                            throw RuntimeClientError.decodeFailed
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    private func request<T: Decodable, B: Encodable>(
        path: String,
        method: String,
        body: B?
    ) async throws -> T {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let authToken {
            request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = try jsonEncoder.encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw RuntimeClientError.invalidResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            if let envelope = try? jsonDecoder.decode(RuntimeErrorEnvelope.self, from: data) {
                throw RuntimeClientError.httpError(envelope.error)
            }
            throw RuntimeClientError.transport("Request failed with status \(http.statusCode)")
        }

        do {
            return try jsonDecoder.decode(T.self, from: data)
        } catch {
            throw RuntimeClientError.decodeFailed
        }
    }
}

private struct ThreadEnvelopeResponse: Codable {
    let protocolVersion: String
    let thread: ThreadSummary
}
