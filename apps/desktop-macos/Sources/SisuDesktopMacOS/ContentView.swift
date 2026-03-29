import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var state: AppState

    var body: some View {
        NavigationSplitView {
            sidebar
        } content: {
            threadList
        } detail: {
            conversationPane
        }
        .toolbar {
            ToolbarItemGroup(placement: .automatic) {
                Button("New Chat") {
                    Task { await state.createThread() }
                }
                Button("Retry") {
                    Task { await state.retryLatestAssistantMessage() }
                }
                .disabled(state.selectedThread == nil || state.isStreaming)
            }
        }
        .alert("Runtime Error", isPresented: .constant(state.lastError != nil), actions: {
            Button("OK") { state.lastError = nil }
        }, message: {
            Text(state.lastError ?? "Unknown error")
        })
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Sisu Desktop")
                .font(.title2.bold())
            HStack {
                Text("Runtime:")
                Text(state.health?.state ?? "unknown")
                    .foregroundStyle(state.health?.state == "ready" ? .green : .orange)
            }
            Picker("Provider", selection: Binding(
                get: { state.selectedProviderId },
                set: { newProvider in
                    let model = state.providers
                        .first(where: { $0.providerId == newProvider })?
                        .models
                        .first?.modelId ?? ""
                    Task { await state.updateModelSelection(providerId: newProvider, modelId: model) }
                })
            ) {
                ForEach(state.providers) { provider in
                    Text(provider.displayName).tag(provider.providerId)
                }
            }
            Picker("Model", selection: Binding(
                get: { state.selectedModelId },
                set: { newModel in
                    Task { await state.updateModelSelection(providerId: state.selectedProviderId, modelId: newModel) }
                })
            ) {
                let selectedProvider = state.providers.first(where: { $0.providerId == state.selectedProviderId })
                ForEach(selectedProvider?.models ?? []) { model in
                    Label(model.displayName, systemImage: model.capabilities.imageInput ? "photo" : "text.bubble")
                        .tag(model.modelId)
                }
            }

            TextField("Search history", text: $state.searchQuery)
                .textFieldStyle(.roundedBorder)
                .onSubmit {
                    Task { await state.runSearch() }
                }

            if !state.searchResults.isEmpty {
                Text("Search Results")
                    .font(.headline)
                List(state.searchResults) { item in
                    VStack(alignment: .leading) {
                        Text(item.excerpt)
                            .lineLimit(2)
                        Text("score \(item.score, specifier: "%.1f")")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .onTapGesture {
                        state.selectedThreadId = item.threadId
                        Task { try? await state.loadThread(item.threadId) }
                    }
                }
            }
            Spacer()
        }
        .padding(14)
    }

    private var threadList: some View {
        List(state.threads, selection: $state.selectedThreadId) { thread in
            VStack(alignment: .leading) {
                Text(thread.title).font(.headline)
                Text("\(thread.providerId) · \(thread.modelId)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .tag(thread.threadId)
            .onTapGesture {
                Task { try? await state.loadThread(thread.threadId) }
            }
        }
    }

    private var conversationPane: some View {
        VStack(spacing: 0) {
            if let thread = state.selectedThread {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        ForEach(thread.messages) { message in
                            messageRow(message)
                        }
                    }
                    .padding()
                }
            } else {
                VStack(spacing: 10) {
                    Image(systemName: "bubble.left.and.bubble.right")
                        .font(.system(size: 28))
                        .foregroundStyle(.secondary)
                    Text("Select a chat")
                        .font(.headline)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            Divider()
            composer
        }
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !state.selectedModelSupportsImages {
                Text("Image uploads disabled for selected model.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            TextEditor(text: $state.composerText)
                .frame(height: 100)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .strokeBorder(.quaternary)
                )
            HStack {
                Button(state.isStreaming ? "Cancel" : "Send") {
                    Task {
                        if state.isStreaming {
                            await state.cancelStreaming()
                        } else {
                            await state.sendMessage()
                        }
                    }
                }
                .keyboardShortcut(.return, modifiers: [.command])
                Spacer()
                if let thread = state.selectedThread {
                    Text("Messages: \(thread.messages.count)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding()
    }

    @ViewBuilder
    private func messageRow(_ message: ThreadMessage) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(message.role.capitalized)
                    .font(.headline)
                Text(state.messageStatus[message.messageId] ?? message.status)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                if message.role != "system" {
                    Button("Branch") {
                        Task { await state.branchFrom(messageId: message.messageId) }
                    }
                    .buttonStyle(.borderless)
                }
            }
            Text(message.content.isEmpty ? "…" : message.content)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(10)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 10))
        }
    }
}
