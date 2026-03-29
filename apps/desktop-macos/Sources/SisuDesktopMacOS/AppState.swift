import Foundation
import SwiftUI

@MainActor
final class AppState: ObservableObject {
    @Published var health: RuntimeHealthResponse?
    @Published var providers: [ProviderCatalogEntry] = []
    @Published var threads: [ThreadSummary] = []
    @Published var selectedThread: ThreadDetailResponse?
    @Published var selectedThreadId: String?
    @Published var selectedProviderId: String = ""
    @Published var selectedModelId: String = ""
    @Published var isStreaming = false
    @Published var composerText = ""
    @Published var searchQuery = ""
    @Published var searchResults: [SearchResultItem] = []
    @Published var messageStatus: [String: String] = [:]
    @Published var lastError: String?
    @Published var branchSourceMessageId: String?

    private let client: RuntimeClient
    private var currentStreamTask: Task<Void, Never>?
    private var currentStreamId: String?
    private var generatedMessageId: String?

    init(client: RuntimeClient) {
        self.client = client
    }

    var selectedModelSupportsImages: Bool {
        providers
            .first(where: { $0.providerId == selectedProviderId })?
            .models
            .first(where: { $0.modelId == selectedModelId })?
            .capabilities
            .imageInput ?? false
    }

    func bootstrap() async {
        do {
            health = try await client.health()
            let catalog = try await client.providers()
            providers = catalog.providers
            if selectedProviderId.isEmpty, let first = providers.first {
                selectedProviderId = first.providerId
                selectedModelId = first.models.first?.modelId ?? ""
            }
            let defaultConfig = try await client.getDefaultModel()
            if let config = defaultConfig.config {
                selectedProviderId = config.providerId
                selectedModelId = config.modelId
            }
            let listed = try await client.listThreads()
            threads = listed.items
            if let first = listed.items.first {
                selectedThreadId = first.threadId
                try await loadThread(first.threadId)
            }
        } catch {
            lastError = error.localizedDescription
        }
    }

    func loadThread(_ threadId: String) async throws {
        let detail = try await client.getThread(threadId: threadId)
        selectedThread = detail
        selectedThreadId = threadId
        for message in detail.messages {
            messageStatus[message.messageId] = message.status
        }
    }

    func createThread() async {
        do {
            let created = try await client.createThread(
                CreateThreadRequest(
                    title: nil,
                    providerId: selectedProviderId.isEmpty ? nil : selectedProviderId,
                    modelId: selectedModelId.isEmpty ? nil : selectedModelId
                )
            )
            threads.insert(created.thread, at: 0)
            try await loadThread(created.thread.threadId)
        } catch {
            lastError = error.localizedDescription
        }
    }

    func sendMessage() async {
        let prompt = composerText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !prompt.isEmpty else { return }
        if selectedProviderId.isEmpty || selectedModelId.isEmpty {
            lastError = "Select a provider and model before sending."
            return
        }
        do {
            isStreaming = true
            composerText = ""
            let accepted = try await client.generate(
                ChatGenerateRequest(
                    threadId: selectedThreadId,
                    prompt: prompt,
                    providerId: selectedProviderId,
                    modelId: selectedModelId,
                    stream: true,
                    retryOfMessageId: nil,
                    attachments: nil
                )
            )
            generatedMessageId = accepted.messageId
            messageStatus[accepted.messageId] = accepted.status
            currentStreamId = accepted.streamId
            currentStreamTask?.cancel()
            currentStreamTask = Task { [weak self] in
                guard let self else { return }
                do {
                    for try await event in self.client.streamEvents(streamId: accepted.streamId) {
                        await MainActor.run {
                            self.messageStatus[event.messageId] = event.type.replacingOccurrences(of: "message.", with: "")
                        }
                    }
                    if let threadId = self.selectedThreadId {
                        try await self.loadThread(threadId)
                    }
                } catch {
                    await MainActor.run {
                        self.lastError = error.localizedDescription
                    }
                }
                await MainActor.run {
                    self.isStreaming = false
                    self.currentStreamId = nil
                }
            }
        } catch {
            isStreaming = false
            lastError = error.localizedDescription
        }
    }

    func cancelStreaming() async {
        guard let currentStreamId else { return }
        do {
            let status = try await client.cancel(streamId: currentStreamId)
            if let generatedMessageId {
                messageStatus[generatedMessageId] = status.status
            }
            isStreaming = false
        } catch {
            lastError = error.localizedDescription
        }
    }

    func retryLatestAssistantMessage() async {
        guard let selectedThread else { return }
        guard let latestAssistant = selectedThread.messages.last(where: { $0.role == "assistant" }) else {
            return
        }
        do {
            isStreaming = true
            let accepted = try await client.generate(
                ChatGenerateRequest(
                    threadId: selectedThread.thread.threadId,
                    prompt: selectedThread.messages.last(where: { $0.role == "user" })?.content ?? "",
                    providerId: selectedProviderId,
                    modelId: selectedModelId,
                    stream: true,
                    retryOfMessageId: latestAssistant.messageId,
                    attachments: nil
                )
            )
            generatedMessageId = accepted.messageId
            messageStatus[accepted.messageId] = accepted.status
            currentStreamId = accepted.streamId
        } catch {
            isStreaming = false
            lastError = error.localizedDescription
        }
    }

    func updateModelSelection(providerId: String, modelId: String) async {
        selectedProviderId = providerId
        selectedModelId = modelId
        do {
            _ = try await client.setDefaultModel(providerId: providerId, modelId: modelId)
            if let threadId = selectedThreadId {
                _ = try await client.setThreadOverride(
                    threadId: threadId,
                    providerId: providerId,
                    modelId: modelId
                )
                try await loadThread(threadId)
            }
        } catch {
            lastError = error.localizedDescription
        }
    }

    func runSearch() async {
        guard !searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            searchResults = []
            return
        }
        do {
            let result = try await client.search(query: searchQuery)
            searchResults = result.items
        } catch {
            lastError = error.localizedDescription
        }
    }

    func branchFrom(messageId: String) async {
        do {
            let branched = try await client.branchThread(
                BranchThreadRequest(sourceMessageId: messageId, title: "Branched chat")
            )
            threads.insert(branched.thread, at: 0)
            try await loadThread(branched.thread.threadId)
            branchSourceMessageId = messageId
        } catch {
            lastError = error.localizedDescription
        }
    }
}
