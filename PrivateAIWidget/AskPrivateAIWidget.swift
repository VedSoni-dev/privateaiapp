import WidgetKit
import SwiftUI
import AppIntents

struct AskWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> AskEntry {
        AskEntry(date: .now, remaining: 10, isPro: false)
    }

    func getSnapshot(in context: Context, completion: @escaping (AskEntry) -> Void) {
        completion(AskEntry(
            date: .now,
            remaining: AppGroupStore.isProHint ? 999 : AppGroupStore.remainingHint,
            isPro: AppGroupStore.isProHint
        ))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<AskEntry>) -> Void) {
        let entry = AskEntry(
            date: .now,
            remaining: AppGroupStore.isProHint ? 999 : max(0, AppGroupStore.remainingHint),
            isPro: AppGroupStore.isProHint
        )
        completion(Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(30 * 60))))
    }
}

struct AskEntry: TimelineEntry {
    let date: Date
    let remaining: Int
    let isPro: Bool
}

struct AskPrivateAIWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AskPrivateAIWidget", provider: AskWidgetProvider()) { entry in
            AskWidgetView(entry: entry)
                .containerBackground(for: .widget) {
                    Color(red: 0.69, green: 0.11, blue: 0.18)
                }
        }
        .configurationDisplayName("Private AI")
        .description("Ask privately from your Home Screen.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct AskWidgetView: View {
    let entry: AskEntry

    var body: some View {
        Link(destination: URL(string: "privateai://ask")!) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: "lock.bubble.fill")
                    Spacer()
                    Text(entry.isPro ? "Pro" : "\(entry.remaining) left")
                        .font(.caption.weight(.semibold))
                }
                Text("Ask privately")
                    .font(.headline)
                Text("Tap to open Private AI")
                    .font(.caption2)
                    .opacity(0.85)
            }
            .foregroundStyle(.white)
            .padding(4)
        }
    }
}
