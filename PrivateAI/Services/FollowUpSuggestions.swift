import Foundation

/// Siri-style next-step prompts under an assistant reply — topic + memory aware.
enum FollowUpSuggestions {
    struct Chip: Identifiable, Hashable {
        let id: String
        let title: String
        let prompt: String
        let systemImage: String
    }

    @MainActor
    static func chips(
        for answer: String,
        question: String = "",
        memory: MemoryStore? = nil
    ) -> [Chip] {
        var chips: [Chip] = [
            Chip(
                id: "deeper",
                title: "Go deeper",
                prompt: "Go deeper on that — more detail, still clear.",
                systemImage: "arrow.down.right.and.arrow.up.left"
            ),
            Chip(
                id: "shorter",
                title: "Make it shorter",
                prompt: "Summarize that in a few short sentences.",
                systemImage: "text.alignleft"
            ),
            Chip(
                id: "examples",
                title: "Give examples",
                prompt: "Give 2–3 concrete examples for that.",
                systemImage: "list.bullet.rectangle"
            ),
            Chip(
                id: "act",
                title: "Make a plan",
                prompt: "Turn that into a short action plan I can do this week.",
                systemImage: "checklist"
            ),
        ]

        let lower = (answer + " " + question).lowercased()

        if lower.contains("email") || lower.contains("message") || lower.contains("draft") {
            chips.insert(
                Chip(
                    id: "rewrite",
                    title: "Rewrite softer",
                    prompt: "Rewrite that more carefully and warmly.",
                    systemImage: "pencil.line"
                ),
                at: 0
            )
        }

        if lower.contains("code") || lower.contains("swift") || lower.contains("api") || lower.contains("```") {
            chips.insert(
                Chip(
                    id: "fix",
                    title: "Add tests",
                    prompt: "Add a few focused tests or edge cases for that code.",
                    systemImage: "checkmark.seal"
                ),
                at: 0
            )
        }

        if answer.count > 600 {
            chips.append(
                Chip(
                    id: "bullets",
                    title: "Bullet points",
                    prompt: "Turn the key points into a short bullet list.",
                    systemImage: "list.bullet"
                )
            )
        }

        if OnDeviceAssist.isAvailable {
            chips.insert(
                Chip(
                    id: "ondevice",
                    title: "On-device summary",
                    prompt: "Summarize the last answer tightly for me (prefer on-device if possible).",
                    systemImage: "iphone"
                ),
                at: 0
            )
        }

        if let memory {
            for fact in memory.relevantFacts(for: question + " " + answer, limit: 2, markUsed: false) {
                chips.append(
                    Chip(
                        id: "mem-\(fact.id.uuidString)",
                        title: "For me",
                        prompt: "Adapt that to me specifically — keep this in mind: \(fact.text)",
                        systemImage: fact.category.systemImage
                    )
                )
            }
        }

        var seen = Set<String>()
        return chips.filter { seen.insert($0.id).inserted }.prefix(4).map { $0 }
    }
}
