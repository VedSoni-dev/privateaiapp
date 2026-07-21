import SwiftUI

struct PaywallView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let colors = app.theme.colors
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    BrandMark(size: 72)

                    Text("Go Pro")
                        .font(.largeTitle.bold())
                        .foregroundStyle(colors.textPrimary)

                    Text("Unlimited messages. Same confidential-compute privacy. Cancel anytime in Settings → Apple ID → Subscriptions.")
                        .font(.body)
                        .foregroundStyle(colors.textSecondary)
                        .multilineTextAlignment(.center)

                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text(app.purchases.priceString)
                            .font(.largeTitle.weight(.bold))
                            .foregroundStyle(colors.textPrimary)
                        Text("/ month")
                            .font(.title3)
                            .foregroundStyle(colors.textMuted)
                    }

                    Button {
                        Task {
                            let ok = await app.purchases.purchase(usage: app.usage)
                            if ok { dismiss() }
                        }
                    } label: {
                        Group {
                            if app.purchases.isPurchasing {
                                ProgressView()
                            } else {
                                Text("Start Pro — \(app.purchases.priceString)/mo")
                                    .font(.headline)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(colors.accent)
                    .disabled(app.purchases.isPurchasing)
                    .accessibilityLabel("Start Pro subscription, \(app.purchases.priceString) per month")

                    Button("Restore purchases") {
                        Task {
                            let ok = await app.purchases.restore(usage: app.usage)
                            if ok { dismiss() }
                        }
                    }
                    .accessibilityLabel("Restore previous purchases")

                    HStack(spacing: 8) {
                        Link("Terms of Use", destination: Legal.termsURL)
                        Text("·").foregroundStyle(colors.textMuted)
                        Link("Privacy Policy", destination: Legal.privacyURL)
                    }
                    .font(.caption)
                    .accessibilityElement(children: .contain)

                    Button("Maybe later") { dismiss() }
                        .foregroundStyle(colors.textMuted)
                        .accessibilityLabel("Maybe later, continue with the free plan")

                    if let err = app.purchases.lastError {
                        Text(err)
                            .font(.caption)
                            .foregroundStyle(colors.error)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(24)
            }
            .background(colors.canvas.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") { dismiss() }
                        .accessibilityLabel("Close")
                }
            }
        }
    }
}
