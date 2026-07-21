import Foundation

/// Siri-style next-step prompts under an assistant reply.
enum FollowUpSuggestions {
    struct Chip: Identifiable, Hashable {
        let id: String
        let title: String
        let prompt: String
        let systemImage: String
    }

    static func chips(for answer: String, question: String = "") -> [Chip] {
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

        if lower.contains("how") || lower.contains("step") || lower.contains("plan") {
            chips.append(
                Chip(
                    id: "steps",
                    title: "Step-by-step",
                    prompt: "Break that into a simple step-by-step plan.",
                    systemImage: "checklist"
                )
            )
        }

        if lower.contains("code") || lower.contains("swift") || lower.contains("api") {
            chips.append(
                Chip(
                    id: "eli5",
                    title: "Explain simply",
                    prompt: "Explain that like I’m new to the topic.",
                    systemImage: "lightbulb"
                )
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

        // Dedupe by id, keep first 4.
        var seen = Set<String>()
        return chips.filter { seen.insert($0.id).inserted }.prefix(4).map { $0 }
    }
}
