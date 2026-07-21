import Foundation

enum DeviceID {
    static let shared = DeviceIDStore()
}

final class DeviceIDStore {
    private let key = "device_id"
    let value: String

    init() {
        if let existing = UserDefaults.standard.string(forKey: key), !existing.isEmpty {
            value = existing
        } else {
            let fresh = UUID().uuidString.lowercased()
            UserDefaults.standard.set(fresh, forKey: key)
            value = fresh
        }
    }
}
