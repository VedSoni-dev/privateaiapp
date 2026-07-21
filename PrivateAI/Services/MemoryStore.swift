import Foundation
import Observation

@MainActor
@Observable
final class MemoryStore {
    struct Fact: Identifiable, Codable, Equatable {
        let id: UUID
        var text: String
        var createdAt: Date
    }

    var facts: [Fact] = []
    private let key = "memory_facts"

    init() { load() }

    func add(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        facts.insert(Fact(id: UUID(), text: trimmed, createdAt: .now), at: 0)
        save()
    }

    func forget(_ id: UUID) {
        facts.removeAll { $0.id == id }
        save()
    }

    func clearAll() {
        facts = []
        save()
    }

    var promptBlock: String {
        guard !facts.isEmpty else { return "" }
        let lines = facts.prefix(20).map { "- \($0.text)" }.joined(separator: "\n")
        return "Known facts about the user:\n\(lines)"
    }

    private func load() {
        guard
            let data = UserDefaults.standard.data(forKey: key),
            let decoded = try? JSONDecoder().decode([Fact].self, from: data)
        else { return }
        facts = decoded
    }

    private func save() {
        if let data = try? JSONEncoder().encode(facts) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }
}
