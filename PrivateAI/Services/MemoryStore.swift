import Foundation
import Observation

enum MemoryCategory: String, Codable, CaseIterable, Identifiable {
    case identity
    case preference
    case project
    case constraint
    case other

    var id: String { rawValue }

    var title: String {
        switch self {
        case .identity: return "About you"
        case .preference: return "Preferences"
        case .project: return "Projects"
        case .constraint: return "Constraints"
        case .other: return "Other"
        }
    }

    var systemImage: String {
        switch self {
        case .identity: return "person.fill"
        case .preference: return "slider.horizontal.3"
        case .project: return "folder.fill"
        case .constraint: return "exclamationmark.shield.fill"
        case .other: return "tray"
        }
    }
}

enum MemorySource: String, Codable {
    case manual
    case localLearn
    case cloudLearn
}

@MainActor
@Observable
final class MemoryStore {
    struct Fact: Identifiable, Codable, Equatable {
        let id: UUID
        var text: String
        var category: MemoryCategory
        var source: MemorySource
        var createdAt: Date
        var lastUsedAt: Date?
        var pinned: Bool

        init(
            id: UUID = UUID(),
            text: String,
            category: MemoryCategory = .other,
            source: MemorySource = .manual,
            createdAt: Date = .now,
            lastUsedAt: Date? = nil,
            pinned: Bool = false
        ) {
            self.id = id
            self.text = text
            self.category = category
            self.source = source
            self.createdAt = createdAt
            self.lastUsedAt = lastUsedAt
            self.pinned = pinned
        }
    }

    var facts: [Fact] = []
    var learningEnabled: Bool {
        didSet { UserDefaults.standard.set(learningEnabled, forKey: learningKey) }
    }

    private let key = "memory_facts_v2"
    private let legacyKey = "memory_facts"
    private let learningKey = "memory_learning_enabled"
    private let maxFacts = 80

    init() {
        self.learningEnabled = UserDefaults.standard.object(forKey: learningKey) as? Bool ?? true
        load()
    }

    func add(
        _ text: String,
        category: MemoryCategory? = nil,
        source: MemorySource = .manual,
        pinned: Bool = false
    ) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        guard !facts.contains(where: { Self.nearDuplicate($0.text, trimmed) }) else { return }

        let fact = Fact(
            text: trimmed,
            category: category ?? Self.inferCategory(trimmed),
            source: source,
            pinned: pinned
        )
        facts.insert(fact, at: 0)
        trimIfNeeded()
        save()
    }

    func forget(_ id: UUID) {
        facts.removeAll { $0.id == id }
        save()
    }

    func togglePin(_ id: UUID) {
        guard let i = facts.firstIndex(where: { $0.id == id }) else { return }
        facts[i].pinned.toggle()
        save()
    }

    func clearAll() {
        facts = []
        save()
    }

    var groupedFacts: [(MemoryCategory, [Fact])] {
        MemoryCategory.allCases.compactMap { cat in
            let items = facts.filter { $0.category == cat }
            return items.isEmpty ? nil : (cat, items)
        }
    }

    /// Ranked memory for a turn — relevance + pin + recency.
    func relevantFacts(for context: String, limit: Int = 12) -> [Fact] {
        let ctx = tokenSet(context)
        let scored: [(Fact, Double)] = facts.map { fact in
            let overlap = Double(tokenSet(fact.text).intersection(ctx).count)
            let pinBoost = fact.pinned ? 3.0 : 0
            let recency: Double = {
                let base = fact.lastUsedAt ?? fact.createdAt
                let days = max(0, Date().timeIntervalSince(base) / 86_400)
                return max(0, 2.0 - days / 30.0)
            }()
            let categoryBoost: Double = switch fact.category {
            case .constraint: 1.5
            case .identity: 1.2
            case .preference: 1.0
            case .project: 0.9
            case .other: 0.5
            }
            return (fact, overlap * categoryBoost + pinBoost + recency)
        }
        .filter { $0.1 > 0.4 || $0.0.pinned }

        let ranked = scored.sorted { $0.1 > $1.1 }.prefix(limit).map(\.0)
        for fact in ranked {
            if let i = facts.firstIndex(where: { $0.id == fact.id }) {
                facts[i].lastUsedAt = .now
            }
        }
        if !ranked.isEmpty { save() }
        return ranked
    }

    func memoryBlock(for userText: String) -> String? {
        let hits = relevantFacts(for: userText)
        guard !hits.isEmpty else { return nil }
        var lines: [String] = []
        let grouped = Dictionary(grouping: hits, by: \.category)
        for cat in MemoryCategory.allCases {
            guard let items = grouped[cat], !items.isEmpty else { continue }
            lines.append("\(cat.title):")
            lines.append(contentsOf: items.map { "• \($0.text)" })
        }
        return lines.joined(separator: "\n")
    }

    // MARK: - Helpers

    private static func inferCategory(_ text: String) -> MemoryCategory {
        let lower = text.lowercased()
        if lower.range(of: #"\b(don't|do not|never|always|allergic|avoid|must not)\b"#, options: .regularExpression) != nil {
            return .constraint
        }
        if lower.range(of: #"\b(prefer|like|hate|favorite|usually|style)\b"#, options: .regularExpression) != nil {
            return .preference
        }
        if lower.range(of: #"\b(building|working on|project|app|startup|thesis)\b"#, options: .regularExpression) != nil {
            return .project
        }
        if lower.range(of: #"\b(i am|i'm|my name|i live|i work|my job)\b"#, options: .regularExpression) != nil {
            return .identity
        }
        return .other
    }

    private static func nearDuplicate(_ a: String, _ b: String) -> Bool {
        if a.caseInsensitiveCompare(b) == .orderedSame { return true }
        let ta = tokenSet(a)
        let tb = tokenSet(b)
        guard !ta.isEmpty, !tb.isEmpty else { return false }
        let inter = Double(ta.intersection(tb).count)
        let union = Double(ta.union(tb).count)
        return inter / union > 0.82
    }

    private static func tokenSet(_ text: String) -> Set<String> {
        let stop: Set<String> = [
            "the", "a", "an", "and", "or", "but", "is", "are", "to", "of", "in", "on", "for",
            "with", "at", "by", "from", "as", "it", "this", "that", "i", "you", "my", "me",
        ]
        return Set(
            text.lowercased()
                .split { !$0.isLetter && !$0.isNumber }
                .map(String.init)
                .filter { $0.count > 1 && !stop.contains($0) }
        )
    }

    private func tokenSet(_ text: String) -> Set<String> { Self.tokenSet(text) }

    private func trimIfNeeded() {
        guard facts.count > maxFacts else { return }
        let pinned = facts.filter(\.pinned)
        var rest = facts.filter { !$0.pinned }
            .sorted { ($0.lastUsedAt ?? $0.createdAt) > ($1.lastUsedAt ?? $1.createdAt) }
        let keep = max(0, maxFacts - pinned.count)
        rest = Array(rest.prefix(keep))
        facts = pinned + rest
    }

    private func load() {
        if let data = UserDefaults.standard.data(forKey: key),
           let decoded = try? JSONDecoder().decode([Fact].self, from: data) {
            facts = decoded
            return
        }
        // Migrate v1 plain strings.
        if let data = UserDefaults.standard.data(forKey: legacyKey),
           let legacy = try? JSONDecoder().decode([LegacyFact].self, from: data) {
            facts = legacy.map {
                Fact(id: $0.id, text: $0.text, category: Self.inferCategory($0.text), source: .localLearn, createdAt: $0.createdAt)
            }
            save()
            UserDefaults.standard.removeObject(forKey: legacyKey)
        }
    }

    private func save() {
        if let data = try? JSONEncoder().encode(facts) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    private struct LegacyFact: Codable {
        let id: UUID
        var text: String
        var createdAt: Date
    }
}
