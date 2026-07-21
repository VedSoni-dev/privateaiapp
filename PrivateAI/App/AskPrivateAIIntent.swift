import AppIntents

/// Opens the app and posts a question for ChatView to pick up.
struct AskPrivateAIIntent: AppIntent {
    static var title: LocalizedStringResource = "Ask Private AI"
    static var description = IntentDescription("Send a private question to Private AI.")
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Question")
    var question: String

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        NotificationCenter.default.post(name: .siriAskText, object: question)
        return .result(dialog: "Opening Private AI with your question.")
    }
}

struct OpenPrivateAIIntent: AppIntent {
    static var title: LocalizedStringResource = "Open Private AI"
    static var description = IntentDescription("Open Private AI to ask something privately.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        .result()
    }
}

struct NewPrivateChatIntent: AppIntent {
    static var title: LocalizedStringResource = "New Private Chat"
    static var description = IntentDescription("Start a fresh Private AI chat.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        NotificationCenter.default.post(name: .siriNewChat, object: false)
        return .result(dialog: "Starting a new chat.")
    }
}

struct StartGhostChatIntent: AppIntent {
    static var title: LocalizedStringResource = "Start Ghost Chat"
    static var description = IntentDescription("Start an unsaved ghost chat in Private AI.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        NotificationCenter.default.post(name: .siriNewChat, object: true)
        return .result(dialog: "Starting a ghost chat. It won’t be saved.")
    }
}

struct SpeakLastAnswerIntent: AppIntent {
    static var title: LocalizedStringResource = "Speak Last Answer"
    static var description = IntentDescription("Read Private AI’s latest reply out loud.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        NotificationCenter.default.post(name: .siriSpeakLast, object: nil)
        return .result(dialog: "Reading the latest answer.")
    }
}

/// Donated phrases must include `${applicationName}` and cannot take free-form
/// String parameters on current SDKs — parameterized asks live in the Shortcuts
/// app via `AskPrivateAIIntent`.
struct PrivateAIShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: OpenPrivateAIIntent(),
            phrases: [
                "Open \(.applicationName)",
                "Ask \(.applicationName)",
                "Start \(.applicationName)",
            ],
            shortTitle: "Open",
            systemImageName: "shield.fill"
        )
        AppShortcut(
            intent: NewPrivateChatIntent(),
            phrases: [
                "New chat in \(.applicationName)",
                "Start a new \(.applicationName) chat",
            ],
            shortTitle: "New Chat",
            systemImageName: "plus.message"
        )
        AppShortcut(
            intent: StartGhostChatIntent(),
            phrases: [
                "Start a ghost chat in \(.applicationName)",
                "Ghost chat with \(.applicationName)",
            ],
            shortTitle: "Ghost Chat",
            systemImageName: "eye.slash"
        )
        AppShortcut(
            intent: SpeakLastAnswerIntent(),
            phrases: [
                "Speak the last \(.applicationName) answer",
                "Read the last \(.applicationName) reply",
            ],
            shortTitle: "Speak Answer",
            systemImageName: "speaker.wave.2.fill"
        )
    }
}

extension Notification.Name {
    static let siriAskText = Notification.Name("siriAskText")
    static let siriNewChat = Notification.Name("siriNewChat")
    static let siriSpeakLast = Notification.Name("siriSpeakLast")
}
