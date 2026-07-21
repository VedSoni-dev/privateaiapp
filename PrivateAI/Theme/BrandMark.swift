import SwiftUI

/// Real logo mark (lock-bubble on crimson) + optional wordmark.
struct BrandMark: View {
    var size: CGFloat = 44
    var showsWordmark: Bool = false

    var body: some View {
        HStack(spacing: 10) {
            Image("BrandLogo")
                .resizable()
                .scaledToFit()
                .frame(width: size, height: size)
                .clipShape(RoundedRectangle(cornerRadius: size * 0.2237, style: .continuous))
                .shadow(color: Color(hex: 0xB01C2E).opacity(0.28), radius: size * 0.12, y: size * 0.04)
                .accessibilityHidden(true)

            if showsWordmark {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Private AI")
                        .font(.headline.weight(.semibold))
                    Text("Locked chat. Yours only.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Private AI")
    }
}

/// Soft crimson wash — echoes the icon’s ruby field without flattening the UI.
struct BrandCanvas: View {
    let colors: AppColors

    var body: some View {
        ZStack {
            colors.canvas
            LinearGradient(
                colors: [
                    colors.accent.opacity(0.09),
                    .clear,
                    colors.canvasSecondary.opacity(0.65),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            RadialGradient(
                colors: [
                    Color(hex: 0xB01C2E).opacity(0.12),
                    .clear,
                ],
                center: .topTrailing,
                startRadius: 10,
                endRadius: 380
            )
            // Frosted “glass” highlight like the logo mark
            RadialGradient(
                colors: [
                    Color.white.opacity(0.35),
                    .clear,
                ],
                center: .topLeading,
                startRadius: 0,
                endRadius: 220
            )
            .blendMode(.softLight)
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}
