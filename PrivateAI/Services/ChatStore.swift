import Foundation
import Observation

@MainActor
@Observable
final class ChatStore {
    var sessions: [ChatSession] = []
    var currentSessionId: UUID?
    var isGenerating = false
    var streamingText = ""
    var statusText: String?
    var webEnabled = true
    var errorMessage: String?
    var pendingToolCalls: [ToolCallInfo] = []
    var shareTarget: ShareCardTarget?
    var showPaywall = false

    private var streamTask: Task<Void, Never>?
    private let storageKey = "chat_sessions_v1"

    var currentSession: ChatSession? {
        guard let id = currentSessionId else { return nil }
        return sessions.first { $0.id == id }
    }

    var currentMessages: [ChatMessage] {
        currentSession?.messages ?? []
    }

    init() {
        load()
        if sessions.isEmpty {
            let session = ChatSession()
            sessions = [session]
            currentSessionId = session.id
            save()
        } else if currentSessionId == nil {
            currentSessionId = sessions.first?.id
        }
    }

    func newChat(ghost: Bool = false) {
        stop()
        let session = ChatSession(isGhost: ghost)
        sessions.insert(session, at: 0)
        currentSessionId = session.id
        if !ghost { save() }
    }

    func selectSession(_ id: UUID) {
        stop()
        currentSessionId = id
    }

    func deleteSession(_ id: UUID) {
        sessions.removeAll { $0.id == id }
        if currentSessionId == id {
            currentSessionId = sessions.first?.id
        }
        save()
    }

    func renameSession(_ id: UUID, title: String) {
        guard let i = sessions.firstIndex(where: { $0.id == id }) else { return }
        sessions[i].title = title
        save()
    }

    func stop() {
        streamTask?.cancel()
        streamTask = nil
        isGenerating = false
        statusText = nil
        LiveActivityController.cancel()
    }

    func send(
        _ text: String,
        deviceId: String,
        memory: MemoryStore,
        usage: UsageStore
    ) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isGenerating else { return }

        if usage.isOverLimit {
            showPaywall = true
            errorMessage = BackendError.quotaExceeded.localizedDescription
            return
        }

        if currentSessionId == nil { newChat() }
        guard let sessionId = currentSessionId,
              let index = sessions.firstIndex(where: { $0.id == sessionId })
        else { return }

        let userMessage = ChatMessage(role: .user, content: trimmed)
        sessions[index].messages.append(userMessage)
        if sessions[index].title == "New chat" {
            sessions[index].title = String(trimmed.prefix(42))
        }
        sessions[index].updatedAt = .now
        persistIfNeeded(sessions[index])

        isGenerating = true
        streamingText = ""
        statusText = "Thinking…"
        errorMessage = nil
        pendingToolCalls = []

        let history = sessions[index].messages.dropLast() // exclude the just-added user msg for prepareTurn history
        let ghost = sessions[index].isGhost

        LiveActivityController.start(question: trimmed)

        streamTask = Task {
            defer {
                isGenerating = false
                statusText = nil
                streamingText = ""
                pendingToolCalls = []
            }

            do {
                let memBlock = ghost ? nil : memory.memoryBlock(for: trimmed)
                let prepared = await AgentService.prepareTurn(
                    history: Array(history),
                    userText: trimmed,
                    webEnabled: webEnabled,
                    memoryBlock: memBlock,
                    deviceId: deviceId,
                    onStatus: { [weak self] status in
                        self?.statusText = status
                    }
                )
                pendingToolCalls = prepared.toolCalls

                guard !Task.isCancelled else {
                    LiveActivityController.cancel()
                    return
                }

                statusText = "Writing…"
                let text = try await BackendClient.shared.chatStream(
                    messages: prepared.messages,
                    deviceId: deviceId,
                    onToken: { [weak self] acc in
                        Task { @MainActor in
                            self?.streamingText = acc
                        }
                    }
                )

                guard !Task.isCancelled else {
                    if let idx = sessions.firstIndex(where: { $0.id == sessionId }) {
                        sessions[idx].messages.append(
                            ChatMessage(role: .assistant, content: streamingText.isEmpty ? text : streamingText, toolCalls: prepared.toolCalls, wasCancelled: true)
                        )
                        persistIfNeeded(sessions[idx])
                    }
                    LiveActivityController.cancel()
                    return
                }

                guard let idx = sessions.firstIndex(where: { $0.id == sessionId }) else { return }
                sessions[idx].messages.append(
                    ChatMessage(role: .assistant, content: text, toolCalls: prepared.toolCalls)
                )
                sessions[idx].updatedAt = .now
                persistIfNeeded(sessions[idx])
                LiveActivityController.complete(preview: text)
                await usage.refreshFromServer()

                if !ghost {
                    memory.learnInBackground(userText: trimmed, assistantText: text, deviceId: deviceId)
                }
            } catch is CancellationError {
                LiveActivityController.cancel()
            } catch {
                LiveActivityController.cancel()
                if error as? BackendError == .quotaExceeded {
                    showPaywall = true
                }
                guard let idx = sessions.firstIndex(where: { $0.id == sessionId }) else { return }
                let message = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
                sessions[idx].messages.append(
                    ChatMessage(role: .assistant, content: message, isError: true)
                )
                errorMessage = message
                persistIfNeeded(sessions[idx])
            }
        }
    }

    private func persistIfNeeded(_ session: ChatSession) {
        guard !session.isGhost else { return }
        save()
    }

    private func load() {
        guard
            let data = UserDefaults.standard.data(forKey: storageKey),
            let decoded = try? JSONDecoder().decode([ChatSession].self, from: data)
        else { return }
        sessions = decoded.sorted { $0.updatedAt > $1.updatedAt }
        currentSessionId = sessions.first?.id
    }

    private func save() {
        let persistable = sessions.filter { !$0.isGhost }
        if let data = try? JSONEncoder().encode(persistable) {
            UserDefaults.standard.set(data, forKey: storageKey)
        }
    }
}

struct ShareCardTarget: Identifiable, Equatable {
    let id = UUID()
    let question: String
    let answer: String
}

extension BackendError: Equatable {
    static func == (lhs: BackendError, rhs: BackendError) -> Bool {
        switch (lhs, rhs) {
        case (.quotaExceeded, .quotaExceeded): return true
        case (.timedOut, .timedOut): return true
        case (.empty, .empty): return true
        case (.decoding, .decoding): return true
        case (.badStatus(let a), .badStatus(let b)): return a == b
        default: return false
        }
    }
}
