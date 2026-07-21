import SwiftUI

/// Root composition root — owns long-lived stores (chat, memory, usage, lock, speech).
/// Agent turns are prepared by `AgentService` / `AgentPromptBuilder`; memory is ranked by `MemoryStore`.
@MainActor
@Observable
final class AppModel {
    var hasCompletedOnboarding: Bool
    var theme: ThemeStore
    var usage: UsageStore
    var chat: ChatStore
    var memory: MemoryStore
    var lock: AppLockStore
    var purchases: PurchaseStore
    var speech: SpeechService
    var suggestions: SuggestionStore

    let deviceId: String

    init() {
        self.deviceId = DeviceID.shared.value
        self.theme = ThemeStore()
        self.usage = UsageStore(deviceId: DeviceID.shared.value)
        self.memory = MemoryStore()
        self.chat = ChatStore()
        self.lock = AppLockStore()
        self.purchases = PurchaseStore()
        self.speech = SpeechService()
        self.suggestions = SuggestionStore()
        self.hasCompletedOnboarding = UserDefaults.standard.bool(forKey: "onboarding_done")

        purchases.start(deviceId: deviceId, usage: usage)
        Task { await usage.refreshFromServer() }
        suggestions.refresh(memory: memory, chat: chat, deviceId: deviceId)
    }

    func completeOnboarding() {
        UserDefaults.standard.set(true, forKey: "onboarding_done")
        hasCompletedOnboarding = true
    }
}
