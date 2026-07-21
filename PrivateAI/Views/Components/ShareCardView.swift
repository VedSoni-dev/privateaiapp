import SwiftUI

struct ShareCardView: View {
    let question: String
    let answer: String

    private let cardBg = Color(hex: 0x1C1416)
    private let crimson = Color(hex: 0xE14F68)
    private let text = Color(hex: 0xF3E8E2)
    private let muted = Color(hex: 0x9C8079)

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Private AI")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(crimson)
                Spacer()
                Text("Confidential")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(muted)
            }

            Text(Self.stripMarkdown(question))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(muted)
                .lineLimit(4)

            Text(Self.stripMarkdown(answer))
                .font(.body)
                .foregroundStyle(text)
                .lineLimit(14)

            Divider().overlay(Color(hex: 0x3D2C2F))

            Text(Legal.appStoreDisplay)
                .font(.caption2)
                .foregroundStyle(muted)
        }
        .padding(20)
        .frame(width: 340, alignment: .leading)
        .background(cardBg)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    static func stripMarkdown(_ md: String) -> String {
        var s = md
        s = s.replacingOccurrences(of: #"```[\s\S]*?```"#, with: "", options: .regularExpression)
        s = s.replacingOccurrences(of: #"`([^`]+)`"#, with: "$1", options: .regularExpression)
        s = s.replacingOccurrences(of: #"\*\*([^*]+)\*\*"#, with: "$1", options: .regularExpression)
        s = s.replacingOccurrences(of: #"^#{1,6}\s+"#, with: "", options: [.regularExpression])
        return s.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

struct ShareCardSheet: View {
    @Environment(\.dismiss) private var dismiss
    let target: ShareCardTarget
    @State private var isSharing = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                ShareCardView(question: target.question, answer: target.answer)
                    .padding()

                Button {
                    shareImage()
                } label: {
                    Text(isSharing ? "Preparing…" : "Share as Image")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.borderedProminent)
                .disabled(isSharing)
                .accessibilityLabel("Share this card as an image")
                .padding(.horizontal)

                Spacer()
            }
            .navigationTitle("Share card")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .accessibilityLabel("Cancel sharing")
                }
            }
        }
    }

    @MainActor
    private func shareImage() {
        isSharing = true
        let view = ShareCardView(question: target.question, answer: target.answer)
        let renderer = ImageRenderer(content: view)
        renderer.scale = 3
        defer { isSharing = false }
        guard let image = renderer.uiImage else { return }
        let ac = UIActivityViewController(activityItems: [image, Legal.appStoreURL], applicationActivities: nil)
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let root = scene.keyWindow?.rootViewController else { return }
        root.present(ac, animated: true)
    }
}

private extension UIWindowScene {
    var keyWindow: UIWindow? { windows.first { $0.isKeyWindow } }
}
