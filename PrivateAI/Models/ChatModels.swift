import Foundation

struct ChatMessage: Identifiable, Codable, Equatable {
    enum Role: String, Codable {
        case system, user, assistant, tool
    }

    let id: UUID
    var role: Role
    var content: String
    var isError: Bool
    var createdAt: Date
    var toolCalls: [ToolCallInfo]
    var wasCancelled: Bool

    init(
        id: UUID = UUID(),
        role: Role,
        content: String,
        isError: Bool = false,
        createdAt: Date = .now,
        toolCalls: [ToolCallInfo] = [],
        wasCancelled: Bool = false
    ) {
        self.id = id
        self.role = role
        self.content = content
        self.isError = isError
        self.createdAt = createdAt
        self.toolCalls = toolCalls
        self.wasCancelled = wasCancelled
    }

    var apiPayload: [String: String] {
        ["role": role.rawValue, "content": content]
    }
}

struct ChatSession: Identifiable, Codable, Equatable {
    var id: UUID
    var title: String
    var messages: [ChatMessage]
    var updatedAt: Date
    var isGhost: Bool

    init(
        id: UUID = UUID(),
        title: String = "New chat",
        messages: [ChatMessage] = [],
        updatedAt: Date = .now,
        isGhost: Bool = false
    ) {
        self.id = id
        self.title = title
        self.messages = messages
        self.updatedAt = updatedAt
        self.isGhost = isGhost
    }
}
