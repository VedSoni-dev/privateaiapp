import Foundation

extension MemoryStore {
    func relevantFacts(for context: String, limit: Int = 14) -> [Fact] {
        let ctx = Set(context.lowercased().split { !$0.isLetter && !$0.isNumber }.map(String.init))
        let stop: Set<String> = [
            "the", "a", "an", "and", "or", "but", "is", "are", "to", "of", "in", "on", "for",
            "with", "at", "by", "from", "as", "it", "this", "that", "i", "you", "my", "me",
        ]
        func score(_ fact: Fact) -> Int {
            let words = Set(fact.text.lowercased().split { !$0.isLetter && !$0.isNumber }.map(String.init))
            return words.filter { !stop.contains($0) && ctx.contains($0) }.count
        }
        return facts
            .map { ($0, score($0)) }
            .filter { $0.1 > 0 }
            .sorted { $0.1 > $1.1 }
            .prefix(limit)
            .map(\.0)
    }

    func memoryBlock(for userText: String) -> String? {
        let hits = relevantFacts(for: userText)
        guard !hits.isEmpty else { return nil }
        return hits.map { "• \($0.text)" }.joined(separator: "\n")
    }

    /// Lightweight local learn: keep first-person durable lines without a backend round-trip delay.
    /// Full extraction can still be layered later via BackendClient.
    func learnLocally(userText: String, assistantText: String) {
        let worth = userText.count >= 60 || userText.range(of: #"\b(i|i'm|im|my|me|mine|we|our)\b"#, options: [.regularExpression, .caseInsensitive]) != nil
        guard worth else { return }
        // Prefer short declarative sentences from the user message.
        let candidates = userText
            .components(separatedBy: CharacterSet(charactersIn: ".!?\n"))
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { $0.count >= 12 && $0.count <= 160 }
            .filter { $0.range(of: #"\b(i|my|i'm|im|we|our)\b"#, options: [.regularExpression, .caseInsensitive]) != nil }
        for line in candidates.prefix(2) {
            if !facts.contains(where: { $0.text.caseInsensitiveCompare(line) == .orderedSame }) {
                add(line)
            }
        }
        _ = assistantText // reserved for backend extraction port
    }

    func learnInBackground(userText: String, assistantText: String, deviceId: String) {
        learnLocally(userText: userText, assistantText: assistantText)
        Task {
            // Optional cloud extraction — best-effort, never blocks chat.
            let prompt = """
            Extract 0-3 durable personal facts about the USER from this exchange. \
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
                    for line in lines.prefix(3) { self.add(line) }
                }
            } catch {
                // ignore
            }
        }
    }
}
