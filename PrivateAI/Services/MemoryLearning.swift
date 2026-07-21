import Foundation

extension MemoryStore {
    /// Lightweight local learn + optional cloud extraction.
    func learnLocally(userText: String, assistantText: String) {
        guard learningEnabled else { return }
        let worth = userText.count >= 60
            || userText.range(of: #"\b(i|i'm|im|my|me|mine|we|our)\b"#, options: [.regularExpression, .caseInsensitive]) != nil
        guard worth else { return }

        let candidates = userText
            .components(separatedBy: CharacterSet(charactersIn: ".!?\n"))
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { $0.count >= 12 && $0.count <= 160 }
            .filter { $0.range(of: #"\b(i|my|i'm|im|we|our)\b"#, options: [.regularExpression, .caseInsensitive]) != nil }

        for line in candidates.prefix(2) {
            add(line, source: .localLearn)
        }
        _ = assistantText
    }

    func learnInBackground(userText: String, assistantText: String, deviceId: String) {
        guard learningEnabled else { return }
        learnLocally(userText: userText, assistantText: assistantText)
        Task {
            let prompt = """
            Extract 0-3 durable personal facts about the USER from this exchange. \
            Prefer lasting identity, preferences, projects, or hard constraints. \
            Skip one-off requests and ephemeral details (today's weather, this message's topic). \
            Reply with one fact per line, or NONE. No bullets, no quotes.
            USER: \(userText)
            ASSISTANT: \(String(assistantText.prefix(1200)))
            """
            do {
                let text = try await BackendClient.shared.chatComplete(
                    messages: [
                        ChatMessage(role: .system, content: "Reasoning: low\n\nYou extract durable user facts only."),
                        ChatMessage(role: .user, content: prompt),
                    ],
                    deviceId: deviceId,
                    maxTokens: 200,
                    temperature: 0.1
                )
                let lines = text
                    .components(separatedBy: .newlines)
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty && $0.uppercased() != "NONE" && $0.count <= 160 }
                await MainActor.run {
                    for line in lines.prefix(3) {
                        self.add(line, source: .cloudLearn)
                    }
                }
            } catch {
                // Best-effort — chat must never depend on memory extraction.
            }
        }
    }
}
