import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Group {
            if app.hasCompletedOnboarding {
                ChatView()
            } else {
                OnboardingView()
            }
        }
        .tint(app.theme.colors.accent)
        .background(app.theme.colors.canvas.ignoresSafeArea())
        .overlay {
            if app.lock.isLocked {
                LockScreenView()
                    .transition(reduceMotion ? .identity : .opacity)
                    .zIndex(10)
            }
        }
        .onAppear { app.theme.systemScheme = colorScheme }
        .onChange(of: colorScheme) { _, scheme in
            app.theme.systemScheme = scheme
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background {
                app.lock.lockIfNeeded()
            }
        }
        .onOpenURL { url in
            handleDeepLink(url)
        }
    }

    private func handleDeepLink(_ url: URL) {
        guard url.scheme == "privateai" else { return }
        let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)

        if url.host == "share" || url.path.contains("share") {
            let text = comps?.queryItems?.first(where: { $0.name == "sharedText" || $0.name == "text" })?.value?
                .removingPercentEncoding
            if let text, !text.isEmpty {
                app.hasCompletedOnboarding = true
                app.chat.newChat()
                NotificationCenter.default.post(name: .shareExtensionText, object: text)
            }
            return
        }

        if url.host == "ask" {
            app.hasCompletedOnboarding = true
            let q = comps?.queryItems?.first(where: { $0.name == "q" || $0.name == "text" })?.value?
                .removingPercentEncoding
            if let q, !q.isEmpty {
                NotificationCenter.default.post(name: .siriAskText, object: q)
            } else {
                NotificationCenter.default.post(name: .siriNewChat, object: false)
            }
        }
    }
}

extension Notification.Name {
    static let shareExtensionText = Notification.Name("shareExtensionText")
}
