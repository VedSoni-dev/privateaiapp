import Foundation

enum APIConfig {
    static let backendURL = URL(string: "https://private-ai-backend.onrender.com")!
    static let searchURL = URL(string: "https://private-ai-search.vedantn06soni.workers.dev")!
    static let freeDailyLimit = 20
}

enum BackendError: LocalizedError {
    case badStatus(Int)
    case quotaExceeded
    case timedOut
    case empty
    case decoding

    var errorDescription: String? {
        switch self {
        case .badStatus(let code): return "Server error (\(code))."
        case .quotaExceeded: return "Daily free limit reached. Upgrade to Pro for unlimited messages."
        case .timedOut: return "That took too long. Try again."
        case .empty: return "No response from the server."
        case .decoding: return "Couldn’t read the server response."
        }
    }
}
