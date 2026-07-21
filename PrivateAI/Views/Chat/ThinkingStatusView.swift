import SwiftUI

/// Compact status caption near the composer — progressive disclosure, not a banner.
struct ThinkingStatusView: View {
    let text: String?
    let colors: AppColors
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        if let text, !text.isEmpty {
            HStack(spacing: 6) {
                if !reduceMotion {
                    ProgressView()
                        .controlSize(.mini)
                        .tint(colors.accentSoft)
                }
                Text(text)
                    .font(.caption)
                    .foregroundStyle(colors.textMuted)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 4)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(text)
            .accessibilityAddTraits(.updatesFrequently)
            .transition(reduceMotion ? .opacity : .asymmetric(
                insertion: .opacity.combined(with: .move(edge: .bottom)),
                removal: .opacity
            ))
        }
    }
}

#if DEBUG
#Preview("Thinking") {
    ThinkingStatusView(text: "Thinking…", colors: .light)
        .padding()
        .background(AppColors.light.canvas)
}

#Preview("Writing") {
    ThinkingStatusView(text: "Writing…", colors: .light)
        .padding()
        .background(AppColors.light.canvas)
}

#Preview("Dark") {
    ThinkingStatusView(text: "Checking latest info…", colors: .dark)
        .padding()
        .background(AppColors.dark.canvas)
        .preferredColorScheme(.dark)
}
#endif
