import SwiftUI

/// In-app explanation of how Private AI stays private — the trust centerpiece.
struct PrivacyTrustView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let colors = app.theme.colors
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    header(colors: colors)
                    pillars(colors: colors)
                    howItWorks(colors: colors)
                    noLogin(colors: colors)
                    controls(colors: colors)
                    legal(colors: colors)
                }
                .padding(24)
            }
            .background { BrandCanvas(colors: colors) }
            .navigationTitle("How privacy works")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func header(colors: AppColors) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            BrandMark(size: 64, showsWordmark: true)
            Text("Built so we can’t peek — and don’t need to.")
                .font(.title2.bold())
                .foregroundStyle(colors.textPrimary)
            Text("Private AI is designed around confidential compute and a no-account model. Here’s exactly what that means.")
                .font(.body)
                .foregroundStyle(colors.textSecondary)
            TrustSealRow(colors: colors)
        }
    }

    private func pillars(colors: AppColors) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("The pillars", colors: colors)
            TrustPillar(
                icon: "person.crop.circle.badge.xmark",
                title: "No account",
                detail: "No email, no password, no profile. Your device gets an anonymous ID so usage limits and Pro restore work — not so we can follow you around the internet.",
                colors: colors
            )
            TrustPillar(
                icon: "lock.rectangle.stack.fill",
                title: "Confidential compute",
                detail: "Inference runs in a confidential-compute environment. The product goal is that operators can’t casually read your prompts like a normal cloud chatbot log.",
                colors: colors
            )
            TrustPillar(
                icon: "iphone.gen3",
                title: "Keys stay off your phone",
                detail: "Your phone never holds the model API key. The app talks to our backend; the backend talks to the model. Compromising the app binary doesn’t leak provider credentials.",
                colors: colors
            )
            TrustPillar(
                icon: "eye.slash.fill",
                title: "Ghost chats",
                detail: "Start a ghost chat and nothing is saved to history. Use it when you want the answer and then want it gone.",
                colors: colors
            )
        }
    }

    private func howItWorks(colors: AppColors) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("What happens when you ask", colors: colors)
            numbered(1, "You type on device — Face ID lock can gate the whole app.", colors: colors)
            numbered(2, "Your message is sent to our backend over HTTPS with your anonymous device ID (for quota / Pro).", colors: colors)
            numbered(3, "The model answers inside confidential compute. We stream tokens back to you.", colors: colors)
            numbered(4, "If live facts are needed, a short lookup runs quietly — we never frame that as “leaving private mode.”", colors: colors)
            numbered(5, "Optional memory stays on your device, visible in Settings, erasable anytime.", colors: colors)
        }
    }

    private func noLogin(colors: AppColors) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("Why there’s no login", colors: colors)
            Text("Login is usually how products build dossiers. We don’t want one. Pro is tied to your Apple ID purchase via the App Store / RevenueCat — restore purchases on a new phone without creating a Private AI account.")
                .font(.body)
                .foregroundStyle(colors.textSecondary)
            Text("If we ever add optional Sign in with Apple, it will be for sync you opt into — never required to chat.")
                .font(.subheadline)
                .foregroundStyle(colors.textMuted)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(colors.elevated.opacity(0.9), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(colors.border.opacity(0.7), lineWidth: 1)
        }
    }

    private func controls(colors: AppColors) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("You’re in control", colors: colors)
            Label("See & erase memory anytime", systemImage: "brain.head.profile")
            Label("Face ID / Touch ID app lock", systemImage: "lock.fill")
            Label("Panic erase everything", systemImage: "trash")
            Label("Report bad answers", systemImage: "exclamationmark.bubble")
        }
        .font(.body)
        .foregroundStyle(colors.textPrimary)
        .labelStyle(.titleAndIcon)
    }

    private func legal(colors: AppColors) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("Legal", colors: colors)
            Link(destination: Legal.privacyURL) {
                Label("Privacy Policy", systemImage: "doc.text")
            }
            Link(destination: Legal.termsURL) {
                Label("Terms of Use", systemImage: "doc.plaintext")
            }
            Text("Questions: open an issue on the project or use Report on any answer.")
                .font(.caption)
                .foregroundStyle(colors.textMuted)
        }
        .font(.body)
    }

    private func sectionTitle(_ text: String, colors: AppColors) -> some View {
        Text(text)
            .font(.title3.bold())
            .foregroundStyle(colors.textPrimary)
    }

    private func numbered(_ n: Int, _ text: String, colors: AppColors) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(n)")
                .font(.caption.weight(.bold))
                .foregroundStyle(.white)
                .frame(width: 22, height: 22)
                .background(colors.accent, in: Circle())
            Text(text)
                .font(.body)
                .foregroundStyle(colors.textSecondary)
        }
    }
}

struct TrustPillar: View {
    let icon: String
    let title: String
    let detail: String
    let colors: AppColors

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(colors.accent)
                .frame(width: 28)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(colors.textPrimary)
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(colors.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(colors.card.opacity(0.92), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(colors.border.opacity(0.65), lineWidth: 1)
        }
    }
}

struct TrustSealRow: View {
    let colors: AppColors

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                seal("No account")
                seal("Confidential compute")
                seal("On-device memory")
                seal("Face ID lock")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Trust seals: no account, confidential compute, on-device memory, Face ID lock")
    }

    private func seal(_ text: String) -> some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .foregroundStyle(colors.accent)
            .padding(.horizontal, 12)
            .frame(minHeight: 32)
            .background(colors.accent.opacity(0.10), in: Capsule())
    }
}
