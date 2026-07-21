import SwiftUI

@MainActor
final class MessagesComposeModel: ObservableObject {
    @Published var question = ""
    @Published var pastedContext = ""
    @Published var selectedContext = ""
    @Published var answer = ""
    @Published var status = ""
    @Published var isBusy = false
    @Published var participantCount = 2
    @Published var error: String?

    var combinedContext: String? {
        let parts = [selectedContext, pastedContext]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: "\n\n")
    }

    func ask() async {
        let q = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty, !isBusy else { return }
        isBusy = true
        error = nil
        status = "Thinking…"
        defer { isBusy = false }
        do {
            let text = try await ExtensionChatClient.ask(
                question: q,
                context: combinedContext,
                deviceId: AppGroupStore.deviceId
            )
            answer = text
            status = "Ready to send"
        } catch {
            self.error = error.localizedDescription
            status = ""
        }
    }
}

struct MessagesRootView: View {
    @ObservedObject var model: MessagesComposeModel
    var onSend: (String, String?, String) -> Void
    var onExpand: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(model.participantCount > 2
                         ? "Group · everyone sees the bubble"
                         : "DM · both of you see the bubble")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    TextField("Ask Private AI…", text: $model.question, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .lineLimit(2...5)

                    DisclosureGroup("Add chat context") {
                        Text("iMessage apps can’t silently read the whole thread. Paste lines, or select a prior Private AI bubble first — GamePigeon-style.")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        TextField("Paste messages / context", text: $model.pastedContext, axis: .vertical)
                            .textFieldStyle(.roundedBorder)
                            .lineLimit(3...8)
                        if !model.selectedContext.isEmpty {
                            Text("From selected bubble")
                                .font(.caption2.weight(.semibold))
                            Text(model.selectedContext)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    if !model.status.isEmpty {
                        Text(model.status)
                            .font(.caption.weight(.medium))
                            .foregroundStyle(Color(red: 0.69, green: 0.11, blue: 0.18))
                    }
                    if let error = model.error {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                    if !model.answer.isEmpty {
                        Text(model.answer)
                            .font(.body)
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
                    }

                    HStack {
                        Button("Expand") { onExpand() }
                        Spacer()
                        Button {
                            Task { await model.ask() }
                        } label: {
                            if model.isBusy {
                                ProgressView()
                            } else {
                                Text("Get answer")
                                    .fontWeight(.semibold)
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Color(red: 0.69, green: 0.11, blue: 0.18))
                        .disabled(model.question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.isBusy)

                        Button("Send") {
                            guard !model.answer.isEmpty else { return }
                            onSend(model.question, model.combinedContext, model.answer)
                        }
                        .buttonStyle(.bordered)
                        .disabled(model.answer.isEmpty)
                    }
                }
                .padding(16)
            }
            .navigationTitle("Private AI")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
