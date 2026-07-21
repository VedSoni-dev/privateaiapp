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
    }
}

extension Notification.Name {
    static let siriAskText = Notification.Name("siriAskText")
}
