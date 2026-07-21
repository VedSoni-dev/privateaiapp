import SwiftUI

struct SettingsView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @Binding var showMemory: Bool
    @State private var confirmErase = false
    @State private var renameId: UUID?
    @State private var renameText = ""
    @State private var showPrivacy = false

    var body: some View {
        @Bindable var app = app
        let colors = app.theme.colors

        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        BrandMark(size: 52, showsWordmark: true)
                        TrustSealRow(colors: colors)
                        Text("No login. Anonymous device ID only. Pro restores through Apple.")
                            .font(.caption)
                            .foregroundStyle(colors.textMuted)
                    }
                    .listRowBackground(Color.clear)
                    .padding(.vertical, 4)
                }

                Section("Trust & legal") {
                    Button {
                        showPrivacy = true
                    } label: {
                        Label("How privacy works", systemImage: "lock.shield.fill")
                    }
                    Link(destination: Legal.privacyURL) {
                        Label("Privacy Policy", systemImage: "doc.text")
                    }
                    Link(destination: Legal.termsURL) {
                        Label("Terms of Use", systemImage: "doc.plaintext")
                    }
                }

                Section("Chats") {
                    Button {
                        app.chat.newChat()
                        dismiss()
                    } label: {
                        Label("New chat", systemImage: "plus")
                    }
                    .accessibilityLabel("Start a new chat")

                    ForEach(app.chat.orderedSessions) { session in
                        Button {
                            app.chat.selectSession(session.id)
                            dismiss()
                        } label: {
                            HStack(alignment: .top, spacing: 10) {
                                if session.isPinned {
                                    Image(systemName: "pin.fill")
                                        .font(.caption)
                                        .foregroundStyle(colors.accent)
                                }
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(session.title).foregroundStyle(colors.textPrimary)
                                    HStack(spacing: 6) {
                                        Label(session.folder.title, systemImage: session.folder.systemImage)
                                        Text("·")
                                        Text(session.updatedAt.formatted(date: .abbreviated, time: .shortened))
                                    }
                                    .font(.caption)
                                    .foregroundStyle(colors.textMuted)
                                    .labelStyle(.titleAndIcon)
                                }
                            }
                        }
                        .accessibilityLabel("Open chat: \(session.title)")
                        .contextMenu {
                            Button(session.isPinned ? "Unpin" : "Pin", systemImage: "pin") {
                                app.chat.togglePin(session.id)
                            }
                            Menu("Move to") {
                                ForEach(ChatSession.Folder.allCases) { folder in
                                    Button(folder.title, systemImage: folder.systemImage) {
                                        app.chat.setFolder(session.id, folder)
                                    }
                                }
                            }
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
                        let list = app.chat.orderedSessions
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

                    Button {
                        Task { await QuotaNotificationScheduler.requestAndSchedule() }
                    } label: {
                        Label("Daily free-message reminder", systemImage: "bell.badge")
                    }
                    .accessibilityLabel("Enable daily free message reminder at 9 AM")
                }

                Section("iMessage") {
                    Text("In Messages, tap Apps → Private AI to ask in a DM or group. Everyone sees the answer bubble. Paste chat context if you want it to play along — Apple blocks silent full-thread reading.")
                        .font(.caption)
                        .foregroundStyle(colors.textMuted)
                }

                Section("Export") {
                    ExportChatsButton()
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
                        HStack {
                            Label("What AI remembers", systemImage: "brain.head.profile")
                            Spacer()
                            Text("\(app.memory.facts.count)")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(colors.textMuted)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(colors.elevated, in: Capsule())
                        }
                    }
                    .accessibilityLabel("What AI remembers about you, \(app.memory.facts.count) facts")

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
            .sheet(isPresented: $showPrivacy) {
                PrivacyTrustView()
                    .environment(app)
            }
        }
    }
}

struct MemoryView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var draft = ""
    @State private var showAdd = false

    var body: some View {
        @Bindable var app = app
        let colors = app.theme.colors

        NavigationStack {
            Group {
                if app.memory.facts.isEmpty && !showAdd {
                    ContentUnavailableView {
                        Label("No memories yet", systemImage: "brain.head.profile")
                    } description: {
                        Text("Private AI can learn durable facts from chats, or you can add them yourself. Ghost chats never teach memory.")
                    } actions: {
                        Button("Add a fact") { showAdd = true }
                    }
                } else {
                    List {
                        Section {
                            Toggle(isOn: $app.memory.learningEnabled) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Learn from chats")
                                    Text("Extracts durable facts in the background. You can forget any of them.")
                                        .font(.caption)
                                        .foregroundStyle(colors.textMuted)
                                }
                            }
                            .accessibilityLabel("Learn from chats")
                        }

                        ForEach(app.memory.groupedFacts, id: \.0) { category, items in
                            Section {
                                ForEach(items) { fact in
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text(fact.text)
                                            .foregroundStyle(colors.textPrimary)
                                        HStack(spacing: 8) {
                                            if fact.pinned {
                                                Label("Pinned", systemImage: "pin.fill")
                                                    .font(.caption2.weight(.semibold))
                                                    .foregroundStyle(colors.accent)
                                            }
                                            Text(sourceLabel(fact.source))
                                                .font(.caption2)
                                                .foregroundStyle(colors.textMuted)
                                        }
                                    }
                                    .swipeActions(edge: .trailing) {
                                        Button("Forget", role: .destructive) {
                                            app.memory.forget(fact.id)
                                        }
                                    }
                                    .swipeActions(edge: .leading) {
                                        Button(fact.pinned ? "Unpin" : "Pin") {
                                            app.memory.togglePin(fact.id)
                                        }
                                        .tint(colors.accent)
                                    }
                                    .contextMenu {
                                        Button(fact.pinned ? "Unpin" : "Pin", systemImage: "pin") {
                                            app.memory.togglePin(fact.id)
                                        }
                                        Button("Forget", systemImage: "trash", role: .destructive) {
                                            app.memory.forget(fact.id)
                                        }
                                    }
                                    .accessibilityLabel("\(category.title): \(fact.text)")
                                }
                            } header: {
                                Label(category.title, systemImage: category.systemImage)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Memory")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        showAdd = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Add memory")
                }
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
            .alert("Add a memory", isPresented: $showAdd) {
                TextField("e.g. I prefer concise answers", text: $draft)
                Button("Save") {
                    app.memory.add(draft, source: .manual)
                    draft = ""
                }
                Button("Cancel", role: .cancel) { draft = "" }
            } message: {
                Text("Stored on this device. Used only when relevant.")
            }
        }
    }

    private func sourceLabel(_ source: MemorySource) -> String {
        switch source {
        case .manual: return "Added by you"
        case .localLearn: return "Learned on-device"
        case .cloudLearn: return "Learned from chat"
        }
    }
}

private struct ExportChatsButton: View {
    @Environment(AppModel.self) private var app
    @State private var passphrase = ""
    @State private var showPrompt = false
    @State private var exportURL: URL?
    @State private var error: String?

    var body: some View {
        Button {
            showPrompt = true
        } label: {
            Label("Export encrypted archive", systemImage: "lock.doc")
        }
        .accessibilityLabel("Export encrypted chat archive")
        .alert("Encrypt export", isPresented: $showPrompt) {
            SecureField("Passphrase", text: $passphrase)
            Button("Export") { export() }
            Button("Cancel", role: .cancel) { passphrase = "" }
        } message: {
            Text("Chats are encrypted with your passphrase (AES-GCM). Ghost chats are skipped.")
        }
        .alert("Export failed", isPresented: Binding(
            get: { error != nil },
            set: { if !$0 { error = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(error ?? "")
        }
        .sheet(item: Binding(
            get: { exportURL.map(IdentifiableURL.init) },
            set: { exportURL = $0?.url }
        )) { item in
            ShareSheet(items: [item.url])
        }
    }

    private func export() {
        defer { passphrase = "" }
        do {
            let data = try ChatExportService.exportEncrypted(
                sessions: app.chat.sessions,
                passphrase: passphrase
            )
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("PrivateAI-chats-\(Int(Date().timeIntervalSince1970)).paiexport")
            try data.write(to: url, options: .atomic)
            exportURL = url
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct IdentifiableURL: Identifiable {
    let id = UUID()
    let url: URL
}

private struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
