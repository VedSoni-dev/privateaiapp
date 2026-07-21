import Foundation

/// Talks only to the Render backend (never holds Privatemode keys).
actor BackendClient {
    static let shared = BackendClient()

    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 60
        config.timeoutIntervalForResource = 120
        return URLSession(configuration: config)
    }()

    func chatComplete(
        messages: [ChatMessage],
        deviceId: String,
        maxTokens: Int = 400,
        temperature: Double = 0.3
    ) async throws -> String {
        var request = URLRequest(url: APIConfig.backendURL.appendingPathComponent("v1/chat"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(deviceId, forHTTPHeaderField: "x-device-id")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "messages": messages.map(\.apiPayload),
            "stream": false,
            "maxTokens": maxTokens,
            "temperature": temperature,
        ])

        let (data, response) = try await session.data(for: request)
        try Self.throwIfNeeded(response)
        guard
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let choices = json["choices"] as? [[String: Any]],
            let message = choices.first?["message"] as? [String: Any],
            let content = message["content"] as? String
        else {
            throw BackendError.decoding
        }
        return content
    }

    /// Streams OpenAI-compatible SSE from the backend; calls `onToken` with accumulated text.
    func chatStream(
        messages: [ChatMessage],
        deviceId: String,
        maxTokens: Int = 1200,
        temperature: Double = 0.7,
        onToken: @Sendable @escaping (String) -> Void
    ) async throws -> String {
        var request = URLRequest(url: APIConfig.backendURL.appendingPathComponent("v1/chat"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(deviceId, forHTTPHeaderField: "x-device-id")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "messages": messages.map(\.apiPayload),
            "stream": true,
            "maxTokens": maxTokens,
            "temperature": temperature,
        ])

        let (bytes, response) = try await session.bytes(for: request)
        try Self.throwIfNeeded(response)

        var accumulated = ""
        var buffer = ""

        for try await byte in bytes {
            buffer.append(Character(UnicodeScalar(byte)))
            while let range = buffer.range(of: "\n") {
                let line = String(buffer[..<range.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
                buffer = String(buffer[range.upperBound...])
                guard line.hasPrefix("data:") else { continue }
                let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                if payload == "[DONE]" { return accumulated }
                guard
                    let data = payload.data(using: .utf8),
                    let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                    let choices = json["choices"] as? [[String: Any]],
                    let delta = choices.first?["delta"] as? [String: Any],
                    let token = delta["content"] as? String
                else { continue }
                accumulated += token
                onToken(accumulated)
            }
        }

        if accumulated.isEmpty {
            // Fallback to non-streaming if SSE was empty (cold start / proxy quirks).
            let full = try await chatComplete(messages: messages, deviceId: deviceId, maxTokens: maxTokens, temperature: temperature)
            onToken(full)
            return full
        }
        return accumulated
    }

    func fetchUsage(deviceId: String) async throws -> (messages: Int, isPro: Bool, date: String) {
        var request = URLRequest(url: APIConfig.backendURL.appendingPathComponent("v1/usage"))
        request.setValue(deviceId, forHTTPHeaderField: "x-device-id")
        let (data, response) = try await session.data(for: request)
        try Self.throwIfNeeded(response)
        guard
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { throw BackendError.decoding }
        let messages = json["messages"] as? Int ?? 0
        let isPro = json["isPro"] as? Bool ?? false
        let date = json["date"] as? String ?? Self.todayString()
        return (messages, isPro, date)
    }

    private static func throwIfNeeded(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else { return }
        if http.statusCode == 402 { throw BackendError.quotaExceeded }
        guard (200..<300).contains(http.statusCode) else {
            throw BackendError.badStatus(http.statusCode)
        }
    }

    static func todayString() -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }
}
