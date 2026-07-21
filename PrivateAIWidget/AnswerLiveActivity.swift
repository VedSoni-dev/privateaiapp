import ActivityKit
import WidgetKit
import SwiftUI

@main
struct PrivateAIWidgetBundle: WidgetBundle {
    var body: some Widget {
        AnswerLiveActivity()
    }
}

struct AnswerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AnswerActivityAttributes.self) { context in
            VStack(alignment: .leading, spacing: 4) {
                Text(context.state.title)
                    .font(.headline)
                    .foregroundStyle(Color(red: 0.88, green: 0.31, blue: 0.41))
                Text(context.state.subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            .padding()
            .activityBackgroundTint(Color(red: 0.11, green: 0.08, blue: 0.09))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "shield.fill")
                        .foregroundStyle(Color(red: 0.88, green: 0.31, blue: 0.41))
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.title)
                        .font(.headline)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.subtitle)
                        .font(.caption)
                        .lineLimit(2)
                }
            } compactLeading: {
                Image(systemName: "shield.fill")
                    .foregroundStyle(Color(red: 0.88, green: 0.31, blue: 0.41))
            } compactTrailing: {
                Image(systemName: context.state.isComplete ? "checkmark" : "ellipsis")
            } minimal: {
                Image(systemName: "shield.fill")
            }
        }
    }
}
