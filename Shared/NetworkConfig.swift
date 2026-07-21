import Foundation

enum NetworkConfig {
    static let backendURL = URL(string: "https://private-ai-backend.onrender.com")!
    static let freeDailyLimit = 10
    static let appGroupID = "group.inc.neocast.privateai"
}

enum AppGroupStore {
    static var defaults: UserDefaults {
        UserDefaults(suiteName: NetworkConfig.appGroupID) ?? .standard
    }

    static var deviceId: String {
        let key = "device_id_v1"
        if let existing = defaults.string(forKey: key), !existing.isEmpty {
            return existing
        }
        let id = UUID().uuidString
        defaults.set(id, forKey: key)
        return id
    }

    static func syncDeviceIdFromApp(_ id: String) {
        defaults.set(id, forKey: "device_id_v1")
    }

    static var remainingHint: Int {
        get { defaults.integer(forKey: "usage_remaining_hint") }
        set { defaults.set(newValue, forKey: "usage_remaining_hint") }
    }

    static var isProHint: Bool {
        get { defaults.bool(forKey: "usage_is_pro_hint") }
        set { defaults.set(newValue, forKey: "usage_is_pro_hint") }
    }
}
