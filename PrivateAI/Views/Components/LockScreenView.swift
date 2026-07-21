import SwiftUI

struct LockScreenView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        let colors = app.theme.colors
        let unlockTitle = "Unlock with \(app.lock.biometryLabel)"
        ZStack {
            colors.canvas.ignoresSafeArea()
            VStack(spacing: 20) {
                Image(systemName: "lock.shield.fill")
                    .font(.largeTitle)
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(colors.accent)
                    .accessibilityHidden(true)
                Text("Private AI")
                    .font(.title.bold())
                    .foregroundStyle(colors.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Text("Unlock to open your conversations.")
                    .font(.subheadline)
                    .foregroundStyle(colors.textMuted)
                Button {
                    Task { await app.lock.unlock() }
                } label: {
                    Text(unlockTitle)
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.borderedProminent)
                .tint(colors.accent)
                .frame(maxWidth: 280)
                .accessibilityLabel(unlockTitle)
            }
            .padding(32)
        }
        .task {
            await app.lock.unlock()
        }
    }
}
