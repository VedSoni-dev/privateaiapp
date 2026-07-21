import Foundation

#if canImport(FoundationModels)
import FoundationModels
#endif

/// Tiny on-device helpers when Apple Intelligence / Foundation Models are available.
@MainActor
enum OnDeviceAssist {
    static var isAvailable: Bool {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            return true
        }
        #endif
        return false
    }

    static func summarize(_ text: String) async -> String? {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            // Best-effort — API surface moves; fall back silently.
            return await run("Summarize in 3 short bullets:\n\n\(String(text.prefix(3500)))")
        }
        #endif
        return nil
    }

    static func rewriteSofter(_ text: String) async -> String? {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            return await run("Rewrite more carefully and warmly:\n\n\(String(text.prefix(2500)))")
        }
        #endif
        return nil
    }

    #if canImport(FoundationModels)
    @available(iOS 26.0, *)
    private static func run(_ prompt: String) async -> String? {
        do {
            let session = LanguageModelSession()
            let response = try await session.respond(to: prompt)
            return String(describing: response)
        } catch {
            return nil
        }
    }
    #endif
}
