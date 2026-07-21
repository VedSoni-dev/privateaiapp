import SwiftUI

struct OnboardingView: View {
    @Environment(AppModel.self) private var app
    @State private var page = 0

    private let slides: [(title: String, body: String, symbol: String)] = [
        (
            "Private by design",
            "Chat runs through confidential-compute cloud inference. No account. No ads. Your phone never holds an API key.",
            "lock.shield.fill"
        ),
        (
            "Ask anything",
            "Streaming answers for writing, code, advice, and more — with optional web search when you need live info.",
            "bubble.left.and.bubble.right.fill"
        ),
        (
            "You stay in control",
            "20 free messages every day. Memory you can see and erase. Face ID lock when you want it.",
            "hand.raised.fill"
        ),
    ]

    var body: some View {
        let colors = app.theme.colors

        VStack(spacing: 0) {
            TabView(selection: $page) {
                ForEach(slides.indices, id: \.self) { i in
                    VStack(spacing: 24) {
                        Spacer()
                        Image(systemName: slides[i].symbol)
                            .font(.system(size: 52))
                            .foregroundStyle(colors.accent)
                            .accessibilityHidden(true)
                        Text(slides[i].title)
                            .font(.largeTitle.bold())
                            .foregroundStyle(colors.textPrimary)
                            .multilineTextAlignment(.center)
                        Text(slides[i].body)
                            .font(.body)
                            .foregroundStyle(colors.textSecondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 28)
                        Spacer()
                    }
                    .tag(i)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Page \(i + 1) of \(slides.count). \(slides[i].title). \(slides[i].body)")
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .always))

            VStack(spacing: 12) {
                Button {
                    if page < slides.count - 1 {
                        withAnimation { page += 1 }
                    } else {
                        app.completeOnboarding()
                    }
                } label: {
                    Text(page < slides.count - 1 ? "Next" : "Get started")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                }
                .buttonStyle(.borderedProminent)
                .tint(colors.accent)
                .accessibilityLabel(page < slides.count - 1 ? "Next" : "Get started")

                if page < slides.count - 1 {
                    Button("Skip") { app.completeOnboarding() }
                        .foregroundStyle(colors.textMuted)
                        .accessibilityLabel("Skip onboarding")
                }

                HStack(spacing: 4) {
                    Text("By continuing you agree to our")
                        .foregroundStyle(colors.textMuted)
                    Link("Terms", destination: Legal.termsURL)
                        .accessibilityLabel("Terms of Use")
                    Text("and")
                        .foregroundStyle(colors.textMuted)
                    Link("Privacy Policy", destination: Legal.privacyURL)
                        .accessibilityLabel("Privacy Policy")
                }
                .font(.caption)
                .multilineTextAlignment(.center)
            }
            .padding(24)
        }
        .background(colors.canvas.ignoresSafeArea())
    }
}
