import Foundation
import ActivityKit

@MainActor
enum LiveActivityController {
    private static var current: Activity<AnswerActivityAttributes>?

    static func start(question: String) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let trimmed = String(question.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression).prefix(80))
        let attributes = AnswerActivityAttributes(question: trimmed)
        let state = AnswerActivityAttributes.ContentState(
            title: "Thinking…",
            subtitle: trimmed,
            isComplete: false
        )

        let previous = current
        current = nil
        Task {
            await previous?.end(dismissalPolicy: .immediate)
        }

        do {
            current = try Activity.request(
                attributes: attributes,
                content: .init(state: state, staleDate: nil),
                pushType: nil
            )
        } catch {
            // Live Activities unavailable — ignore.
        }
    }

    static func complete(preview: String) {
        guard let activity = current else { return }
        current = nil
        let state = AnswerActivityAttributes.ContentState(
            title: "Answer ready",
            subtitle: String(preview.prefix(80)),
            isComplete: true
        )
        Task {
            await activity.end(
                ActivityContent(state: state, staleDate: nil),
                dismissalPolicy: .default
            )
        }
    }

    static func cancel() {
        guard let activity = current else { return }
        current = nil
        Task {
            await activity.end(dismissalPolicy: .immediate)
        }
    }
}
