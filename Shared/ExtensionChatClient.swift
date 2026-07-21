import Foundation

/// Minimal chat client for extensions (Messages, widgets) — no full app stores.
enum ExtensionChatClient {
    static func ask(
        question: String,
        context: String?,
        deviceId: String
    ) async throws -> String {
        var messages: [[String: String]] = [
            [
                "role": "system",
                "content": """
                Reasoning: low
                You are Private AI in iMessage. Answer briefly, clearly, and for a group chat audience. \
                Use short paragraphs. Never tell people to visit websites. If context from the chat is provided, use it.
                """,
            ],
        ]
        if let context, !context.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            messages.append([
                "role": "user",
                "content": "Chat context people shared with you:\n\(context)\n\nQuestion:\n\(question)",
            ])
        } else {
            messages.append(["role": "user", "content": question])
        }

        var request = URLRequest(url: NetworkConfig.backendURL.appendingPathComponent("v1/chat"))
        request.httpMethod = "POST"
        request.timeoutInterval = 45
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(deviceId, forHTTPHeaderField: "x-device-id")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "messages": messages,
            "stream": false,
            "maxTokens": 700,
            "temperature": 0.6,
        ])

        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, http.statusCode == 429 {
            throw ExtensionChatError.quota
        }
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw ExtensionChatError.server
        }
        guard
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let choices = json["choices"] as? [[String: Any]],
            let message = choices.first?["message"] as? [String: Any],
            let content = message["content"] as? String
        else {
            throw ExtensionChatError.decoding
        }
        return content
    }
}

enum ExtensionChatError: LocalizedError {
    case quota, server, decoding

    var errorDescription: String? {
        switch self {
        case .quota: return "Daily free limit reached. Open Private AI to upgrade."
        case .server: return "Couldn’t reach Private AI. Try again."
        case .decoding: return "Got a weird response. Try again."
        }
    }
}
