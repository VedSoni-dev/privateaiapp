import SwiftUI

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

    let deviceId: String

    init() {
        self.deviceId = DeviceID.shared.value
        self.theme = ThemeStore()
        self.usage = UsageStore(deviceId: DeviceID.shared.value)
        self.memory = MemoryStore()
        self.chat = ChatStore()
        self.lock = AppLockStore()
        self.purchases = PurchaseStore()
        self.hasCompletedOnboarding = UserDefaults.standard.bool(forKey: "onboarding_done")

        purchases.start(deviceId: deviceId, usage: usage)
        Task { await usage.refreshFromServer() }
    }

    func completeOnboarding() {
        UserDefaults.standard.set(true, forKey: "onboarding_done")
        hasCompletedOnboarding = true
    }
}
