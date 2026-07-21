import SwiftUI

struct SettingsView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @Binding var showMemory: Bool
    @State private var confirmErase = false
    @State private var renameId: UUID?
    @State private var renameText = ""

    var body: some View {
        @Bindable var app = app
        let colors = app.theme.colors

        NavigationStack {
            List {
                Section("Chats") {
                    Button {
                        app.chat.newChat()
                        dismiss()
                    } label: {
                        Label("New chat", systemImage: "plus")
                    }
                    .accessibilityLabel("Start a new chat")

                    ForEach(app.chat.sessions.filter { !$0.isGhost }) { session in
                        Button {
                            app.chat.selectSession(session.id)
                            dismiss()
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(session.title).foregroundStyle(colors.textPrimary)
                                Text(session.updatedAt.formatted(date: .abbreviated, time: .shortened))
                                    .font(.caption)
                                    .foregroundStyle(colors.textMuted)
                            }
                        }
                        .accessibilityLabel("Open chat: \(session.title)")
                        .contextMenu {
                            Button("Rename") {
                                renameId = session.id
                                renameText = session.title
                            }
                            Button("Delete", role: .destructive) {
                                app.chat.deleteSession(session.id)
                            }
                        }
                    }
                    .onDelete { indexSet in
                        let list = app.chat.sessions.filter { !$0.isGhost }
                        for i in indexSet { app.chat.deleteSession(list[i].id) }
                    }
                }

                Section("Preferences") {
                    Picker("Appearance", selection: $app.theme.mode) {
                        ForEach(ThemeMode.allCases) { mode in
                            Text(mode.title).tag(mode)
                        }
                    }
                    .accessibilityLabel("Appearance")

                    Toggle(isOn: $app.chat.webEnabled) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Web search")
                            Text("Only the query leaves your phone when search runs.")
                                .font(.caption)
                                .foregroundStyle(colors.textMuted)
                        }
                    }
                    .accessibilityLabel("Web search")
                }

                Section("Privacy") {
                    Button {
                        app.chat.newChat(ghost: true)
                        dismiss()
                    } label: {
                        Label("Ghost chat", systemImage: "eye.slash")
                    }
                    .accessibilityLabel("Start a ghost chat that is never saved")

                    Button {
                        dismiss()
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                            showMemory = true
                        }
                    } label: {
                        Label("What AI remembers", systemImage: "brain.head.profile")
                    }
                    .accessibilityLabel("What AI remembers about you")

                    Toggle(isOn: Binding(
                        get: { app.lock.isEnabled },
                        set: { newValue in
                            Task { _ = await app.lock.setEnabled(newValue) }
                        }
                    )) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(app.lock.biometryLabel) lock")
                            Text(app.lock.isAvailable
                                  ? "Require \(app.lock.biometryLabel) to open the app"
                                  : "Needs \(app.lock.biometryLabel) set up on this device")
                                .font(.caption)
                                .foregroundStyle(colors.textMuted)
                        }
                    }
                    .disabled(!app.lock.isAvailable && !app.lock.isEnabled)
                    .accessibilityLabel("Require \(app.lock.biometryLabel) to open the app")

                    Button(role: .destructive) {
                        confirmErase = true
                    } label: {
                        Label("Erase everything", systemImage: "trash")
                    }
                    .accessibilityLabel("Erase all chats and memories on this device")
                }

                Section("Plan") {
                    if app.usage.isPro {
                        Text("Pro active — unlimited messages")
                            .foregroundStyle(colors.success)
                    } else {
                        Button {
                            dismiss()
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                                app.chat.showPaywall = true
                            }
                        } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Upgrade to Pro")
                                    .fontWeight(.semibold)
                                Text("\(app.usage.messagesUsed) / \(APIConfig.freeDailyLimit) free today · \(app.purchases.priceString)/mo")
                                    .font(.caption)
                                    .foregroundStyle(colors.textMuted)
                            }
                        }
                        .accessibilityLabel("Upgrade to Pro")
                    }
                }
            }
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .accessibilityLabel("Close settings")
                }
            }
            .confirmationDialog(
                "Erase all chats and memories on this device?",
                isPresented: $confirmErase,
                titleVisibility: .visible
            ) {
                Button("Erase everything", role: .destructive) {
                    app.chat.sessions = []
                    app.chat.newChat()
                    app.memory.clearAll()
                    dismiss()
                }
                Button("Cancel", role: .cancel) {}
            }
            .alert("Rename chat", isPresented: Binding(
                get: { renameId != nil },
                set: { if !$0 { renameId = nil } }
            )) {
                TextField("Title", text: $renameText)
                Button("Save") {
                    if let id = renameId {
                        app.chat.renameSession(id, title: renameText)
                    }
                    renameId = nil
                }
                Button("Cancel", role: .cancel) { renameId = nil }
            }
        }
    }
}

struct MemoryView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if app.memory.facts.isEmpty {
                    ContentUnavailableView(
                        "No memories yet",
                        systemImage: "brain",
                        description: Text("Facts Private AI learns will show up here. You can forget any of them.")
                    )
                } else {
                    List {
                        ForEach(app.memory.facts) { fact in
                            Text(fact.text)
                                .swipeActions {
                                    Button("Forget", role: .destructive) {
                                        app.memory.forget(fact.id)
                                    }
                                    .accessibilityLabel("Forget: \(fact.text)")
                                }
                        }
                    }
                }
            }
            .navigationTitle("Memory")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .accessibilityLabel("Close")
                }
                if !app.memory.facts.isEmpty {
                    ToolbarItem(placement: .bottomBar) {
                        Button("Forget everything", role: .destructive) {
                            app.memory.clearAll()
                        }
                        .accessibilityLabel("Forget everything")
                    }
                }
            }
        }
    }
}
