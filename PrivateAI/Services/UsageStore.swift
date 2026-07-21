import Foundation
import Observation

@MainActor
@Observable
final class UsageStore {
    var messagesUsed: Int = 0
    var isPro: Bool = false
    var date: String = BackendClient.todayString()

    private let deviceId: String
    private let defaultsKey = "usage_cache"

    var remaining: Int {
        max(0, APIConfig.freeDailyLimit - messagesUsed)
    }

    var isOverLimit: Bool {
        !isPro && messagesUsed >= APIConfig.freeDailyLimit
    }

    init(deviceId: String) {
        self.deviceId = deviceId
        loadLocal()
    }

    func setPro(_ value: Bool) {
        isPro = value
        saveLocal()
    }

    func refreshFromServer() async {
        do {
            let snap = try await BackendClient.shared.fetchUsage(deviceId: deviceId)
            messagesUsed = snap.messages
            // Prefer server truth, but don't clobber a just-purchased local Pro.
            isPro = snap.isPro || isPro
            date = snap.date
            saveLocal()
        } catch {
            // Keep local cache; Render free tier may be cold.
        }
    }

    private func loadLocal() {
        guard
            let data = UserDefaults.standard.data(forKey: defaultsKey),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return }
        let storedDate = json["date"] as? String ?? BackendClient.todayString()
        if storedDate == BackendClient.todayString() {
            messagesUsed = json["messages"] as? Int ?? 0
            date = storedDate
        } else {
            messagesUsed = 0
            date = BackendClient.todayString()
        }
        isPro = json["isPro"] as? Bool ?? false
        AppGroupStore.isProHint = isPro
        AppGroupStore.remainingHint = remaining
    }

    private func saveLocal() {
        let payload: [String: Any] = [
            "date": date,
            "messages": messagesUsed,
            "isPro": isPro,
        ]
        if let data = try? JSONSerialization.data(withJSONObject: payload) {
            UserDefaults.standard.set(data, forKey: defaultsKey)
        }
        AppGroupStore.isProHint = isPro
        AppGroupStore.remainingHint = remaining
    }
}
