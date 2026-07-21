import SwiftUI

/// Floating bottom composer — Liquid Glass chrome (iOS 26+) or ultra-thin material.
struct ComposerBar: View {
    @Binding var input: String
    var inputFocused: FocusState<Bool>.Binding
    let colors: AppColors
    let isGenerating: Bool
    let isPro: Bool
    let remaining: Int
    let onSend: () -> Void
    let onStop: () -> Void
    let onUpgrade: () -> Void

    private var canSend: Bool {
        !input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .bottom, spacing: 10) {
                TextField("Ask privately…", text: $input, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(.body)
                    .lineLimit(1...6)
                    .focused(inputFocused)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .accessibilityLabel("Ask Private AI")
                    .accessibilityHint("Type a question, or use Dictation from the keyboard")

                sendOrStop
            }

            usageRow
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
        .floatingChrome(in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(colors.border.opacity(0.45), lineWidth: 0.5)
        }
    }

    @ViewBuilder
    private var sendOrStop: some View {
        if isGenerating {
            Button(action: onStop) {
                Image(systemName: "stop.fill")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(colors.textPrimary)
                    .frame(width: 44, height: 44)
                    .background(colors.elevated.opacity(0.9), in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Stop generating")
        } else {
            Button(action: onSend) {
                Image(systemName: "arrow.up")
                    .font(.body.weight(.bold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(
                        canSend ? colors.accent : colors.textMuted.opacity(0.45),
                        in: Circle()
                    )
            }
            .buttonStyle(.plain)
            .disabled(!canSend)
            .accessibilityLabel("Send message")
        }
    }

    private var usageRow: some View {
        HStack(alignment: .firstTextBaseline) {
            if isPro {
                Text("Pro · unlimited")
                    .font(.caption)
                    .foregroundStyle(colors.textMuted)
            } else {
                Button(action: onUpgrade) {
                    Text("\(remaining) free left today · Upgrade")
                        .font(.caption)
                        .foregroundStyle(colors.accent)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Upgrade to Pro")
            }
            Spacer(minLength: 8)
            Text("Private · No account · AI can err")
                .font(.caption2)
                .foregroundStyle(colors.textMuted)
        }
    }
}

extension View {
    /// Navigation / chrome glass. Never use on scroll-content rows.
    @ViewBuilder
    func floatingChrome(in shape: some Shape) -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(.regular, in: shape)
        } else {
            self.background(.ultraThinMaterial, in: shape)
        }
    }
}

#if DEBUG
private struct ComposerBarPreviewHost: View {
    @State private var input = ""
    @FocusState private var focused: Bool
    var isGenerating = false
    var isPro = false
    var remaining = 8
    var colors: AppColors = .light

    var body: some View {
        ComposerBar(
            input: $input,
            inputFocused: $focused,
            colors: colors,
            isGenerating: isGenerating,
            isPro: isPro,
            remaining: remaining,
            onSend: {},
            onStop: {},
            onUpgrade: {}
        )
        .padding()
        .background(colors.canvas)
    }
}

#Preview("Idle") {
    ComposerBarPreviewHost()
}

#Preview("Generating") {
    ComposerBarPreviewHost(isGenerating: true, isPro: true, remaining: 0)
}

#Preview("Dark") {
    ComposerBarPreviewHost(colors: .dark)
        .preferredColorScheme(.dark)
}
#endif
