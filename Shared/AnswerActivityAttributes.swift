import Foundation
import ActivityKit

public struct AnswerActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var title: String
        public var subtitle: String
        public var isComplete: Bool

        public init(title: String, subtitle: String, isComplete: Bool) {
            self.title = title
            self.subtitle = subtitle
            self.isComplete = isComplete
        }
    }

    public var question: String

    public init(question: String) {
        self.question = question
    }
}
