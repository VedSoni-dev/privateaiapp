import Foundation
import Observation

/// Smart empty-state openers — personalized from memory + recent chats, cached per day.
@MainActor
@Observable
final class SuggestionStore {
    struct Chip: Identifiable, Equatable {
        let id: String
        let icon: String
        let text: String
    }

    private(set) var chips: [Chip] = []
    private(set) var isLoading = false

    private let cacheKey = "suggestion_chips_v1"
    private let minFacts = 2

    private static let fallback: [Chip] = [
        Chip(id: "reg", icon: "globe", text: "What’s the latest on AI regulation?"),
        Chip(id: "email", icon: "envelope", text: "Help me write a careful email"),
        Chip(id: "explain", icon: "lightbulb", text: "Explain a concept simply"),
        Chip(id: "week", icon: "calendar", text: "Plan my week in three priorities"),
    ]

    func refresh(memory: MemoryStore, chat: ChatStore, deviceId: String) {
        // Instant local personalization while cloud chips load.
        chips = Self.localChips(memory: memory, chat: chat)
        guard memory.facts.count >= minFacts, memory.learningEnabled else { return }
        if let cached = loadCache(), cached.count >= 2 {
            chips = cached
        }
        Task { await fetchPersonalized(memory: memory, deviceId: deviceId, chat: chat) }
    }

    private func fetchPersonalized(memory: MemoryStore, deviceId: String, chat: ChatStore) async {
        isLoading = true
        defer { isLoading = false }
        let factList = memory.facts.prefix(10).map { "- [\($0.category.title)] \($0.text)" }.joined(separator: "\n")
        let recent = chat.sessions
            .filter { !$0.isGhost }
            .prefix(4)
            .map(\.title)
            .joined(separator: "; ")
        let prompt = """
        Facts about the user:
        \(factList)

        Recent chat titles: \(recent.isEmpty ? "none" : recent)

        Write exactly 4 short chat openers they would tap today. Specific to THEM. Max 9 words each.
        Never mention memory or facts meta-style.
        Output exactly 4 lines: SF_SYMBOL | suggestion
        Example: envelope | Draft the investor update email
        Prefer SF symbols: envelope, calendar, lightbulb, briefcase, figure.run, heart, hammer, chart.line.uptrend.xyaxis, book, sparkles
        """
        do {
            let text = try await BackendClient.shared.chatComplete(
                messages: [
                    ChatMessage(
                        role: .system,
                        content: "Reasoning: low\n\nYou write personal chat-opener suggestions for Private AI."
                    ),
                    ChatMessage(role: .user, content: prompt),
                ],
                deviceId: deviceId,
                maxTokens: 220,
                temperature: 0.7
            )
            let parsed = Self.parse(text)
            if parsed.count >= 2 {
                chips = parsed
                saveCache(parsed)
            }
        } catch {
            // Keep local chips.
        }
    }

    private static func localChips(memory: MemoryStore, chat: ChatStore) -> [Chip] {
        var out: [Chip] = []
        let pinned = memory.facts.filter(\.pinned).prefix(2)
        for fact in pinned {
            out.append(Chip(
                id: "pin-\(fact.id.uuidString)",
                icon: fact.category.systemImage,
                text: Self.opener(from: fact)
            ))
        }
        for fact in memory.facts.prefix(6) where out.count < 4 {
            let chip = Chip(
                id: "mem-\(fact.id.uuidString)",
                icon: fact.category.systemImage,
                text: Self.opener(from: fact)
            )
            if !out.contains(where: { $0.text == chip.text }) {
                out.append(chip)
            }
        }
        for title in chat.sessions.filter({ !$0.isGhost }).prefix(3).map(\.title) where out.count < 4 {
            guard title != "New chat", title.count >= 8 else { continue }
            out.append(Chip(id: "chat-\(title)", icon: "bubble.left", text: "Continue: \(String(title.prefix(36)))"))
        }
        if out.count < 4 {
            for fb in fallback where out.count < 4 {
                if !out.contains(where: { $0.text == fb.text }) { out.append(fb) }
            }
        }
        return Array(out.prefix(4))
    }

    private static func opener(from fact: MemoryStore.Fact) -> String {
        let t = fact.text.trimmingCharacters(in: .whitespacesAndNewlines)
        switch fact.category {
        case .project:
            return "Update on \(String(t.prefix(40)))"
        case .preference:
            return "Help with: \(String(t.prefix(40)))"
        case .constraint:
            return "Keep this in mind: \(String(t.prefix(40)))"
        case .identity:
            return "Advice for me: \(String(t.prefix(40)))"
        case .other:
            return String(t.prefix(48))
        }
    }

    private static func parse(_ text: String) -> [Chip] {
        text.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .compactMap { line -> Chip? in
                let parts = line.split(separator: "|", maxSplits: 1).map {
                    $0.trimmingCharacters(in: .whitespacesAndNewlines)
                }
                guard parts.count == 2, parts[1].count >= 4 else { return nil }
                let icon = parts[0]
                    .replacingOccurrences(of: #"^[\d\.\-\*]+\s*"#, with: "", options: .regularExpression)
                let suggestion = parts[1].trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
                return Chip(id: suggestion, icon: icon.isEmpty ? "sparkles" : icon, text: String(suggestion.prefix(80)))
            }
            .prefix(4)
            .map { $0 }
    }

    private struct Cache: Codable {
        var date: String
        var items: [Stored]
        struct Stored: Codable {
            var icon: String
            var text: String
        }
    }

    private func loadCache() -> [Chip]? {
        guard
            let data = UserDefaults.standard.data(forKey: cacheKey),
            let cache = try? JSONDecoder().decode(Cache.self, from: data),
            cache.date == BackendClient.todayString()
        else { return nil }
        return cache.items.map { Chip(id: $0.text, icon: $0.icon, text: $0.text) }
    }

    private func saveCache(_ chips: [Chip]) {
        let cache = Cache(
            date: BackendClient.todayString(),
            items: chips.map { .init(icon: $0.icon, text: $0.text) }
        )
        if let data = try? JSONEncoder().encode(cache) {
            UserDefaults.standard.set(data, forKey: cacheKey)
        }
    }
}
