import SwiftUI

struct OnboardingView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
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
            "Memory you can see, pin, and erase. Face ID lock when you want it. 20 free messages every day.",
            "hand.raised.fill"
        ),
    ]

    var body: some View {
        let colors = app.theme.colors

        ZStack {
            BrandCanvas(colors: colors)

            VStack(spacing: 0) {
                BrandMark(size: 64, showsWordmark: true)
                    .padding(.top, 28)
                    .padding(.horizontal, 24)
                    .frame(maxWidth: .infinity, alignment: .leading)

                TabView(selection: $page) {
                    ForEach(slides.indices, id: \.self) { i in
                        VStack(spacing: 20) {
                            Spacer()
                            Image(systemName: slides[i].symbol)
                                .font(.system(size: 48, weight: .semibold))
                                .foregroundStyle(colors.accent)
                                .symbolRenderingMode(.hierarchical)
                                .symbolEffect(.pulse, isActive: page == i && !reduceMotion)
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
                            if reduceMotion {
                                page += 1
                            } else {
                                withAnimation(.snappy) { page += 1 }
                            }
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
        }
    }
}
