import ActivityKit
import WidgetKit
import SwiftUI

@main
struct PrivateAIWidgetBundle: WidgetBundle {
    var body: some Widget {
        AskPrivateAIWidget()
        AnswerLiveActivity()
    }
}

struct AnswerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AnswerActivityAttributes.self) { context in
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(Color.white.opacity(0.15))
                        .frame(width: 36, height: 36)
                    Image(systemName: context.state.isComplete ? "checkmark" : "lock.bubble.fill")
                        .foregroundStyle(.white)
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text(context.state.title)
                        .font(.headline)
                        .foregroundStyle(.white)
                    Text(context.state.subtitle)
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.85))
                        .lineLimit(2)
                }
                Spacer(minLength: 0)
            }
            .padding(14)
            .activityBackgroundTint(Color(red: 0.69, green: 0.11, blue: 0.18))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "lock.bubble.fill")
                        .foregroundStyle(Color(red: 0.91, green: 0.32, blue: 0.39))
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.title)
                        .font(.headline)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.subtitle)
                        .font(.caption)
                        .lineLimit(3)
                }
            } compactLeading: {
                Image(systemName: "lock.bubble.fill")
                    .foregroundStyle(Color(red: 0.91, green: 0.32, blue: 0.39))
            } compactTrailing: {
                if context.state.isComplete {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                } else {
                    ProgressView()
                }
            } minimal: {
                Image(systemName: "lock.bubble.fill")
            }
        }
    }
}
