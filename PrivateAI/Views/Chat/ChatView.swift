import SwiftUI

struct ChatView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var input = ""
    @State private var showSettings = false
    @State private var showMemory = false
    @FocusState private var inputFocused: Bool

    var body: some View {
        NavigationStack {
            chatBody
                .navigationTitle("Private AI")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { toolbarContent }
                .modifier(ChatSheetsModifier(
                    app: app,
                    showSettings: $showSettings,
                    showMemory: $showMemory
                ))
                .modifier(ChatAlertsModifier(chat: app.chat))
                .onReceive(NotificationCenter.default.publisher(for: .shareExtensionText)) { note in
                    if let text = note.object as? String {
                        input = text
                        inputFocused = true
                    }
                }
                .onReceive(NotificationCenter.default.publisher(for: .siriAskText)) { note in
                    if let text = note.object as? String, !text.isEmpty {
                        input = text
                        send()
                    }
                }
                .onReceive(NotificationCenter.default.publisher(for: .siriNewChat)) { note in
                    let ghost = (note.object as? Bool) ?? false
                    app.speech.stop()
                    app.chat.newChat(ghost: ghost)
                    input = ""
                    inputFocused = true
                }
                .onReceive(NotificationCenter.default.publisher(for: .siriSpeakLast)) { _ in
                    guard let last = app.chat.currentMessages.last(where: { $0.role == .assistant }),
                          !last.content.isEmpty
                    else { return }
                    app.speech.speak(last.content, messageId: last.id)
                }
        }
    }

    private var chatBody: some View {
        let colors = app.theme.colors
        return ZStack(alignment: .bottom) {
            messageList(colors: colors)
                .scrollDismissesKeyboard(.interactively)

            VStack(spacing: 0) {
                statusLine(colors: colors)
                composer(colors: colors)
            }
        }
        .background(colors.canvas.ignoresSafeArea())
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            if app.chat.currentSession?.isGhost == true {
                Text("Ghost")
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .foregroundStyle(app.theme.colors.accentSoft)
                    .background(app.theme.colors.accentSoft.opacity(0.12), in: Capsule())
                    .accessibilityLabel("Ghost chat, not saved")
            }
        }
        ToolbarItem(placement: .topBarTrailing) {
            Button {
                Haptics.light()
                showSettings = true
            } label: {
                Image(systemName: "sidebar.left")
                    .font(.body.weight(.semibold))
                    .frame(minWidth: 44, minHeight: 44)
            }
            .accessibilityLabel("Settings and chat history")
        }
    }

    @ViewBuilder
    private func statusLine(colors: AppColors) -> some View {
        if let status = app.chat.statusText {
            Text(status)
                .font(.caption.weight(.medium))
                .foregroundStyle(colors.accent)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.vertical, 6)
                .accessibilityLabel(status)
        }
    }

    private func composer(colors: AppColors) -> some View {
        ComposerBar(
            input: $input,
            inputFocused: $inputFocused,
            colors: colors,
            webEnabled: app.chat.webEnabled,
            isGenerating: app.chat.isGenerating,
            isPro: app.usage.isPro,
            remaining: app.usage.remaining,
            onToggleWeb: { app.chat.webEnabled = $0 },
            onSend: send,
            onStop: {
                Haptics.light()
                app.speech.stop()
                app.chat.stop()
            },
            onUpgrade: { app.chat.showPaywall = true }
        )
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
    }

    @ViewBuilder
    private func messageList(colors: AppColors) -> some View {
        let messages = app.chat.currentMessages
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    if messages.isEmpty && app.chat.streamingText.isEmpty {
                        emptyState(colors: colors)
                    }
                    ForEach(Array(messages.enumerated()), id: \.element.id) { index, message in
                        let prevUser = messages[..<index].last(where: { $0.role == .user })?.content ?? ""
                        let isLatestAssistant = message.role == .assistant
                            && message.id == messages.last(where: { $0.role == .assistant })?.id
                            && app.chat.streamingText.isEmpty
                        MessageBubble(
                            message: message,
                            previousUserText: prevUser,
                            isLatestAssistant: isLatestAssistant,
                            onFollowUp: { prompt in
                                input = prompt
                                send()
                            }
                        )
                        .id(message.id.uuidString)
                    }
                    if !app.chat.streamingText.isEmpty {
                        MessageBubble(
                            message: ChatMessage(
                                role: .assistant,
                                content: app.chat.streamingText,
                                toolCalls: app.chat.pendingToolCalls
                            )
                        )
                        .id("streaming")
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 160)
            }
            .onChange(of: messages.count) { _, _ in
                guard let id = messages.last?.id.uuidString else { return }
                if reduceMotion {
                    proxy.scrollTo(id, anchor: .bottom)
                } else {
                    withAnimation(.easeOut(duration: 0.25)) {
                        proxy.scrollTo(id, anchor: .bottom)
                    }
                }
            }
            .onChange(of: app.chat.streamingText) { _, _ in
                proxy.scrollTo("streaming", anchor: .bottom)
            }
        }
    }

    private func emptyState(colors: AppColors) -> some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: "waveform.circle.fill")
                    .font(.title)
                    .foregroundStyle(colors.accent)
                    .symbolRenderingMode(.hierarchical)
                    .accessibilityHidden(true)
                Text("Ask anything.\nPrivately.")
                    .font(.largeTitle.bold())
                    .foregroundStyle(colors.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Speak replies, tap follow-ups, or say “Ask Private AI” to Siri.")
                    .font(.subheadline)
                    .foregroundStyle(colors.textSecondary)
            }
            VStack(spacing: 8) {
                suggestion("What’s the latest on AI regulation?", icon: "globe", colors: colors)
                suggestion("Help me write a careful email", icon: "envelope", colors: colors)
                suggestion("Explain a concept simply", icon: "lightbulb", colors: colors)
                suggestion("Plan my week in three priorities", icon: "calendar", colors: colors)
            }
        }
        .padding(.top, 28)
    }

    private func suggestion(_ text: String, icon: String, colors: AppColors) -> some View {
        Button {
            Haptics.selection()
            input = text
            send()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .foregroundStyle(colors.accent)
                    .frame(width: 22, alignment: .center)
                Text(text)
                    .font(.body)
                    .foregroundStyle(colors.textSecondary)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .padding(14)
            .background(colors.card.opacity(0.9), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(colors.border.opacity(0.8), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(text)
    }

    private func send() {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        Haptics.medium()
        app.speech.stop()
        input = ""
        inputFocused = false
        app.chat.send(text, deviceId: app.deviceId, memory: app.memory, usage: app.usage)
    }
}

private struct ChatSheetsModifier: ViewModifier {
    @Bindable var app: AppModel
    @Binding var showSettings: Bool
    @Binding var showMemory: Bool

    func body(content: Content) -> some View {
        content
            .sheet(isPresented: $showSettings) {
                SettingsView(showMemory: $showMemory)
                    .environment(app)
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
            }
            .sheet(isPresented: $showMemory) {
                MemoryView()
                    .environment(app)
            }
            .sheet(isPresented: Binding(
                get: { app.chat.showPaywall },
                set: { app.chat.showPaywall = $0 }
            )) {
                PaywallView()
                    .environment(app)
            }
            .sheet(item: Binding(
                get: { app.chat.shareTarget },
                set: { app.chat.shareTarget = $0 }
            )) { target in
                ShareCardSheet(target: target)
            }
    }
}

private struct ChatAlertsModifier: ViewModifier {
    @Bindable var chat: ChatStore

    func body(content: Content) -> some View {
        content
            .alert("Notice", isPresented: Binding(
                get: { chat.errorMessage != nil && !chat.showPaywall },
                set: { if !$0 { chat.errorMessage = nil } }
            )) {
                Button("OK", role: .cancel) { chat.errorMessage = nil }
                if chat.errorMessage?.contains("limit") == true {
                    Button("Upgrade") { chat.showPaywall = true }
                }
            } message: {
                Text(chat.errorMessage ?? "")
            }
    }
}
