import SwiftUI

struct OnboardingView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var page = 0
    @State private var showPrivacy = false

    private let slides: [(title: String, body: String, symbol: String)] = [
        (
            "Private by design",
            "Confidential-compute answers. No account. No ads. Your phone never holds a model API key.",
            "lock.bubble.fill"
        ),
        (
            "No login on purpose",
            "We don’t ask for email or a password. An anonymous device ID handles free limits and Pro — nothing to dox, nothing to phish.",
            "person.crop.circle.badge.xmark"
        ),
        (
            "Ask anything",
            "Writing, code, advice, live facts when needed — streamed to you with markdown, speak-aloud, and follow-ups.",
            "bubble.left.and.bubble.right.fill"
        ),
        (
            "You’re in control",
            "Memory you can see and erase. Ghost chats that never save. Face ID lock. 10 free messages a day.",
            "hand.raised.fill"
        ),
    ]

    var body: some View {
        let colors = app.theme.colors

        ZStack {
            BrandCanvas(colors: colors)

            VStack(spacing: 0) {
                HStack {
                    BrandMark(size: 52, showsWordmark: true)
                    Spacer()
                    Button("How privacy works") { showPrivacy = true }
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(colors.accent)
                }
                .padding(.top, 20)
                .padding(.horizontal, 24)

                TabView(selection: $page) {
                    ForEach(slides.indices, id: \.self) { i in
                        VStack(spacing: 18) {
                            Spacer(minLength: 12)
                            Image(systemName: slides[i].symbol)
                                .font(.system(size: 54, weight: .semibold))
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
                            if i == 0 {
                                TrustSealRow(colors: colors)
                                    .padding(.horizontal, 20)
                                    .padding(.top, 4)
                            }
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
                            if reduceMotion { page += 1 }
                            else { withAnimation(.snappy) { page += 1 } }
                        } else {
                            app.completeOnboarding()
                        }
                    } label: {
                        Text(page < slides.count - 1 ? "Continue" : "Start privately")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(colors.accent)
                    .accessibilityLabel(page < slides.count - 1 ? "Continue" : "Start privately")

                    if page < slides.count - 1 {
                        Button("Skip") { app.completeOnboarding() }
                            .foregroundStyle(colors.textMuted)
                    }

                    VStack(spacing: 6) {
                        HStack(spacing: 4) {
                            Text("By continuing you agree to our")
                                .foregroundStyle(colors.textMuted)
                            Link("Terms", destination: Legal.termsURL)
                            Text("and")
                                .foregroundStyle(colors.textMuted)
                            Link("Privacy Policy", destination: Legal.privacyURL)
                        }
                        .font(.caption)
                        Text("No account required.")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(colors.accent)
                    }
                    .multilineTextAlignment(.center)
                }
                .padding(24)
            }
        }
        .sheet(isPresented: $showPrivacy) {
            PrivacyTrustView()
        }
    }
}
