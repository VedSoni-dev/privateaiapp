import SwiftUI

/// Floating bottom composer — Liquid Glass chrome (iOS 26+) or ultra-thin material.
struct ComposerBar: View {
    @Binding var input: String
    var inputFocused: FocusState<Bool>.Binding
    let colors: AppColors
    let webEnabled: Bool
    let isGenerating: Bool
    let isPro: Bool
    let remaining: Int
    let onToggleWeb: (Bool) -> Void
    let onSend: () -> Void
    let onStop: () -> Void
    let onUpgrade: () -> Void

    private var canSend: Bool {
        !input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            modePicker

            HStack(alignment: .bottom, spacing: 10) {
                TextField("Message", text: $input, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(.body)
                    .lineLimit(1...6)
                    .focused(inputFocused)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .accessibilityLabel("Message input")

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

    private var modePicker: some View {
        HStack(spacing: 6) {
            modeChip(
                title: "Private",
                selected: !webEnabled,
                accessibilityLabel: "Private mode, no web search"
            ) {
                onToggleWeb(false)
            }
            modeChip(
                title: "Web",
                selected: webEnabled,
                accessibilityLabel: "Web mode, searches the web when helpful"
            ) {
                onToggleWeb(true)
            }
            Spacer(minLength: 0)
        }
    }

    private func modeChip(
        title: String,
        selected: Bool,
        accessibilityLabel: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(selected ? colors.accent : colors.textSecondary)
                .padding(.horizontal, 14)
                .frame(minHeight: 44)
                .background(
                    selected ? colors.accent.opacity(0.14) : colors.card.opacity(0.55),
                    in: Capsule()
                )
                .overlay {
                    Capsule()
                        .stroke(selected ? colors.accent.opacity(0.35) : colors.border.opacity(0.5), lineWidth: 1)
                }
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityAddTraits(selected ? .isSelected : [])
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
            Text("AI can make mistakes")
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
    var webEnabled = false
    var isPro = false
    var remaining = 8
    var colors: AppColors = .light

    var body: some View {
        ComposerBar(
            input: $input,
            inputFocused: $focused,
            colors: colors,
            webEnabled: webEnabled,
            isGenerating: isGenerating,
            isPro: isPro,
            remaining: remaining,
            onToggleWeb: { _ in },
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
    ComposerBarPreviewHost(isGenerating: true, webEnabled: true, isPro: true, remaining: 0)
}

#Preview("Dark") {
    ComposerBarPreviewHost(colors: .dark)
        .preferredColorScheme(.dark)
}
#endif
