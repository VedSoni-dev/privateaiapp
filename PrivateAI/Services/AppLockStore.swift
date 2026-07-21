import Foundation
import Observation
import LocalAuthentication

@MainActor
@Observable
final class AppLockStore {
    var isEnabled: Bool
    var isAvailable: Bool = false
    var isLocked: Bool = false
    var biometryLabel: String = "Passcode"

    private let key = "app_lock_enabled"

    init() {
        self.isEnabled = UserDefaults.standard.bool(forKey: key)
        Task { await refreshAvailability() }
        if isEnabled { isLocked = true }
    }

    func refreshAvailability() async {
        let context = LAContext()
        var error: NSError?
        isAvailable = context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error)
        biometryLabel = Self.label(for: context)
    }

    private static func label(for context: LAContext) -> String {
        switch context.biometryType {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        case .opticID: return "Optic ID"
        default: return "Passcode"
        }
    }

    func setEnabled(_ enabled: Bool) async -> Bool {
        if enabled {
            let ok = await authenticate(reason: "Enable \(biometryLabel) lock for Private AI")
            guard ok else { return false }
            isEnabled = true
            UserDefaults.standard.set(true, forKey: key)
            return true
        } else {
            let ok = await authenticate(reason: "Disable \(biometryLabel) lock")
            guard ok else { return false }
            isEnabled = false
            isLocked = false
            UserDefaults.standard.set(false, forKey: key)
            return true
        }
    }

    func lockIfNeeded() {
        if isEnabled { isLocked = true }
    }

    func unlock() async {
        let ok = await authenticate(reason: "Unlock Private AI")
        if ok { isLocked = false }
    }

    /// Fail-open when biometrics unavailable so users aren't permanently locked out.
    func authenticate(reason: String) async -> Bool {
        await refreshAvailability()
        guard isAvailable else { return true }
        let context = LAContext()
        context.localizedCancelTitle = "Cancel"
        return await withCheckedContinuation { cont in
            context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { success, _ in
                cont.resume(returning: success)
            }
        }
    }
}
