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
    enum Folder: String, Codable, CaseIterable, Identifiable {
        case inbox, work, personal, archive
        var id: String { rawValue }
        var title: String {
            switch self {
            case .inbox: return "Inbox"
            case .work: return "Work"
            case .personal: return "Personal"
            case .archive: return "Archive"
            }
        }
        var systemImage: String {
            switch self {
            case .inbox: return "tray"
            case .work: return "briefcase"
            case .personal: return "heart"
            case .archive: return "archivebox"
            }
        }
    }

    var id: UUID
    var title: String
    var messages: [ChatMessage]
    var updatedAt: Date
    var isGhost: Bool
    var isPinned: Bool
    var folder: Folder

    init(
        id: UUID = UUID(),
        title: String = "New chat",
        messages: [ChatMessage] = [],
        updatedAt: Date = .now,
        isGhost: Bool = false,
        isPinned: Bool = false,
        folder: Folder = .inbox
    ) {
        self.id = id
        self.title = title
        self.messages = messages
        self.updatedAt = updatedAt
        self.isGhost = isGhost
        self.isPinned = isPinned
        self.folder = folder
    }

    enum CodingKeys: String, CodingKey {
        case id, title, messages, updatedAt, isGhost, isPinned, folder
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        messages = try c.decode([ChatMessage].self, forKey: .messages)
        updatedAt = try c.decode(Date.self, forKey: .updatedAt)
        isGhost = try c.decodeIfPresent(Bool.self, forKey: .isGhost) ?? false
        isPinned = try c.decodeIfPresent(Bool.self, forKey: .isPinned) ?? false
        folder = try c.decodeIfPresent(Folder.self, forKey: .folder) ?? .inbox
    }
}
