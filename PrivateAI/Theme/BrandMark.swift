import SwiftUI

/// App mark: shield + waveform — matches the store icon.
struct BrandMark: View {
    var size: CGFloat = 44
    var showsWordmark: Bool = false

    var body: some View {
        HStack(spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: size * 0.22, style: .continuous)
                    .fill(Color(hex: 0x0E1A22))
                    .frame(width: size, height: size)

                Image(systemName: "shield.fill")
                    .font(.system(size: size * 0.52, weight: .semibold))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color(hex: 0x7AE0CC), Color(hex: 0x2EC4B6)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .symbolRenderingMode(.monochrome)
                    .overlay {
                        Image(systemName: "waveform")
                            .font(.system(size: size * 0.22, weight: .bold))
                            .foregroundStyle(Color(hex: 0x0E1A22))
                            .offset(y: size * 0.02)
                            .accessibilityHidden(true)
                    }
            }
            .accessibilityHidden(true)

            if showsWordmark {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Private AI")
                        .font(.headline.weight(.semibold))
                    Text("Confidential by design")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Private AI")
    }
}

/// Soft depth behind chat / onboarding without flat single-color fills.
struct BrandCanvas: View {
    let colors: AppColors

    var body: some View {
        ZStack {
            colors.canvas
            LinearGradient(
                colors: [
                    colors.accentSoft.opacity(0.10),
                    .clear,
                    colors.canvasSecondary.opacity(0.55),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            RadialGradient(
                colors: [colors.accent.opacity(0.08), .clear],
                center: .topTrailing,
                startRadius: 20,
                endRadius: 420
            )
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}
