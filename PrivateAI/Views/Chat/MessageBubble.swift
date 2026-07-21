import SwiftUI

struct MessageBubble: View {
    @Environment(AppModel.self) private var app
    let message: ChatMessage
    var previousUserText: String = ""
    var isLatestAssistant: Bool = false
    var onFollowUp: ((String) -> Void)?

    var body: some View {
        let colors = app.theme.colors
        let isUser = message.role == .user
        let isSpeakingThis = app.speech.isSpeaking && app.speech.speakingMessageId == message.id

        HStack(alignment: .top, spacing: 0) {
            if isUser { Spacer(minLength: 56) }

            VStack(alignment: isUser ? .trailing : .leading, spacing: 8) {
                if !message.toolCalls.isEmpty {
                    FlowTools(toolCalls: message.toolCalls)
                }

                Group {
                    if isUser {
                        Text(message.content)
                            .font(.body)
                            .foregroundStyle(colors.textPrimary)
                            .multilineTextAlignment(.trailing)
                    } else if let attributed = try? AttributedString(
                        markdown: message.content,
                        options: AttributedString.MarkdownParsingOptions(
                            interpretedSyntax: .inlineOnlyPreservingWhitespace
                        )
                    ) {
                        Text(attributed)
                            .font(.body)
                            .foregroundStyle(message.isError ? colors.error : colors.textPrimary)
                            .multilineTextAlignment(.leading)
                    } else {
                        Text(message.content)
                            .font(.body)
                            .foregroundStyle(message.isError ? colors.error : colors.textPrimary)
                            .multilineTextAlignment(.leading)
                    }
                }
                .textSelection(.enabled)
                .padding(.horizontal, isUser ? 14 : 0)
                .padding(.vertical, isUser ? 10 : 0)
                .background {
                    if isUser {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(colors.elevated)
                            .overlay {
                                RoundedRectangle(cornerRadius: 18, style: .continuous)
                                    .stroke(colors.accent.opacity(0.12), lineWidth: 1)
                            }
                    }
                }

                if message.wasCancelled {
                    Text("Stopped")
                        .font(.caption2)
                        .foregroundStyle(colors.textMuted)
                }

                let sources = message.toolCalls.flatMap(\.sources)
                if !sources.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Sources")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(colors.textMuted)
                        ForEach(Array(sources.enumerated()), id: \.offset) { i, source in
                            Link(destination: URL(string: source.url) ?? Legal.appStoreURL) {
                                Text("\(i + 1). \(source.title)")
                                    .font(.caption)
                                    .lineLimit(2)
                            }
                            .accessibilityLabel("Source: \(source.title)")
                        }
                    }
                    .padding(.top, 2)
                }

                if !isUser, !message.isError, !message.content.isEmpty {
                    MessageActionRow(
                        isSpeaking: isSpeakingThis,
                        colors: colors,
                        onSpeak: { app.speech.toggle(message.content, messageId: message.id) },
                        onCopy: {
                            UIPasteboard.general.string = message.content
                            Haptics.success()
                        },
                        onShareImage: {
                            app.chat.shareTarget = ShareCardTarget(
                                question: previousUserText,
                                answer: message.content
                            )
                        },
                        onShareText: { presentShare(message.content) },
                        onAddToCalendar: { CalendarService.presentAddEvent(from: message.content) },
                        onReport: {
                            UIApplication.shared.open(Legal.reportContentURL(messageText: message.content))
                        }
                    )
                }

                if isLatestAssistant,
                   !isUser,
                   !message.isError,
                   !app.chat.isGenerating,
                   !message.content.isEmpty {
                    FollowUpChipRow(
                        chips: FollowUpSuggestions.chips(
                            for: message.content,
                            question: previousUserText
                        ),
                        colors: colors,
                        onSelect: { prompt in
                            Haptics.selection()
                            onFollowUp?(prompt)
                        }
                    )
                }
            }
            .frame(maxWidth: .infinity, alignment: isUser ? .trailing : .leading)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(isUser ? "Your message: \(message.content)" : "AI answer: \(message.content)")
            .accessibilityAddTraits(isSpeakingThis ? .startsMediaSession : [])
            .contextMenu { messageMenu(isUser: isUser, isSpeakingThis: isSpeakingThis) }
            .accessibilityAction(named: "Copy") {
                UIPasteboard.general.string = message.content
                Haptics.success()
            }
            .accessibilityAction(named: isSpeakingThis ? "Stop Speaking" : "Speak") {
                app.speech.toggle(message.content, messageId: message.id)
            }
            .modifier(AssistantAccessibilityActions(
                isUser: isUser,
                onShareImage: {
                    app.chat.shareTarget = ShareCardTarget(
                        question: previousUserText,
                        answer: message.content
                    )
                },
                onShareText: { presentShare(message.content) },
                onAddToCalendar: { CalendarService.presentAddEvent(from: message.content) },
                onReport: {
                    UIApplication.shared.open(Legal.reportContentURL(messageText: message.content))
                }
            ))

            if !isUser { Spacer(minLength: 40) }
        }
    }

    @ViewBuilder
    private func messageMenu(isUser: Bool, isSpeakingThis: Bool) -> some View {
        Button(isSpeakingThis ? "Stop Speaking" : "Speak", systemImage: isSpeakingThis ? "stop.fill" : "speaker.wave.2.fill") {
            app.speech.toggle(message.content, messageId: message.id)
        }
        Button("Copy", systemImage: "doc.on.doc") {
            UIPasteboard.general.string = message.content
            Haptics.success()
        }
        if !isUser {
            Button("Share as Image", systemImage: "photo") {
                app.chat.shareTarget = ShareCardTarget(
                    question: previousUserText,
                    answer: message.content
                )
            }
            Button("Share Text", systemImage: "square.and.arrow.up") {
                presentShare(message.content)
            }
            Button("Add to Calendar", systemImage: "calendar.badge.plus") {
                CalendarService.presentAddEvent(from: message.content)
            }
            Button("Report", systemImage: "exclamationmark.bubble", role: .destructive) {
                UIApplication.shared.open(Legal.reportContentURL(messageText: message.content))
            }
        }
    }

    private func presentShare(_ text: String) {
        let ac = UIActivityViewController(activityItems: [text], applicationActivities: nil)
        if let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let root = scene.keyWindow?.rootViewController {
            root.present(ac, animated: true)
        }
    }
}

/// Compact Siri-like actions under assistant replies.
private struct MessageActionRow: View {
    let isSpeaking: Bool
    let colors: AppColors
    let onSpeak: () -> Void
    let onCopy: () -> Void
    let onShareImage: () -> Void
    let onShareText: () -> Void
    let onAddToCalendar: () -> Void
    let onReport: () -> Void

    var body: some View {
        HStack(spacing: 4) {
            actionButton(
                systemImage: isSpeaking ? "stop.fill" : "speaker.wave.2.fill",
                label: isSpeaking ? "Stop Speaking" : "Speak",
                action: onSpeak
            )
            actionButton(systemImage: "doc.on.doc", label: "Copy", action: onCopy)
            actionButton(systemImage: "square.and.arrow.up", label: "Share", action: onShareText)
            Menu {
                Button("Share as Image", systemImage: "photo", action: onShareImage)
                Button("Add to Calendar", systemImage: "calendar.badge.plus", action: onAddToCalendar)
                Button("Report", systemImage: "exclamationmark.bubble", role: .destructive, action: onReport)
            } label: {
                Image(systemName: "ellipsis")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(colors.textSecondary)
                    .frame(minWidth: 36, minHeight: 36)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("More actions")
            Spacer(minLength: 0)
        }
        .padding(.top, 2)
    }

    private func actionButton(systemImage: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.caption.weight(.semibold))
                .foregroundStyle(colors.textSecondary)
                .frame(minWidth: 36, minHeight: 36)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

private struct FollowUpChipRow: View {
    let chips: [FollowUpSuggestions.Chip]
    let colors: AppColors
    let onSelect: (String) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(chips) { chip in
                    Button {
                        onSelect(chip.prompt)
                    } label: {
                        Label(chip.title, systemImage: chip.systemImage)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(colors.accent)
                            .padding(.horizontal, 12)
                            .frame(minHeight: 36)
                            .background(colors.accent.opacity(0.10), in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(chip.title)
                    .accessibilityHint(chip.prompt)
                }
            }
            .padding(.vertical, 2)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Suggested follow-ups")
    }
}

/// Named VoiceOver actions for assistant replies (mirrors the context menu).
private struct AssistantAccessibilityActions: ViewModifier {
    let isUser: Bool
    let onShareImage: () -> Void
    let onShareText: () -> Void
    let onAddToCalendar: () -> Void
    let onReport: () -> Void

    func body(content view: Content) -> some View {
        if isUser {
            view
        } else {
            view
                .accessibilityAction(named: "Share as Image", onShareImage)
                .accessibilityAction(named: "Share Text", onShareText)
                .accessibilityAction(named: "Add to Calendar", onAddToCalendar)
                .accessibilityAction(named: "Report", onReport)
        }
    }
}

private struct FlowTools: View {
    @Environment(AppModel.self) private var app
    let toolCalls: [ToolCallInfo]

    var body: some View {
        let colors = app.theme.colors
        HStack(spacing: 6) {
            ForEach(toolCalls) { call in
                Label {
                    Text(call.tool == "web_search"
                         ? (call.found ? "\(call.sources.count) sources" : "No results")
                         : call.tool)
                } icon: {
                    Image(systemName: call.tool == "web_search" ? "globe" : "wrench.and.screwdriver")
                }
                .font(.caption2.weight(.semibold))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .foregroundStyle(colors.textSecondary)
                .background(colors.elevated.opacity(0.8), in: Capsule())
                .labelStyle(.titleAndIcon)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

private extension UIWindowScene {
    var keyWindow: UIWindow? { windows.first { $0.isKeyWindow } }
}

#if DEBUG
#Preview("Assistant") {
    MessageBubble(
        message: ChatMessage(
            role: .assistant,
            content: "Private AI keeps your prompts in **confidential compute** — nothing is stored for ghost chats."
        ),
        isLatestAssistant: true,
        onFollowUp: { _ in }
    )
    .padding()
    .background(AppColors.light.canvas)
    .environment(AppModel())
}

#Preview("User") {
    MessageBubble(
        message: ChatMessage(role: .user, content: "Help me write a careful email")
    )
    .padding()
    .background(AppColors.light.canvas)
    .environment(AppModel())
}
#endif
