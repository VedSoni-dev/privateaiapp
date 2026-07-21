import Foundation

enum DeviceID {
    static let shared = DeviceIDStore()
}

final class DeviceIDStore {
    private let key = "device_id"
    let value: String

    init() {
        // Prefer app-group id so Messages / widgets share quota identity.
        if let group = AppGroupStore.defaults.string(forKey: "device_id_v1"), !group.isEmpty {
            value = group
            UserDefaults.standard.set(group, forKey: key)
            return
        }
        if let existing = UserDefaults.standard.string(forKey: key), !existing.isEmpty {
            value = existing
            AppGroupStore.syncDeviceIdFromApp(existing)
            return
        }
        let fresh = UUID().uuidString.lowercased()
        UserDefaults.standard.set(fresh, forKey: key)
        AppGroupStore.syncDeviceIdFromApp(fresh)
        value = fresh
    }
}
