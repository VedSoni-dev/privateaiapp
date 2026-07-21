import SwiftUI

@main
struct PrivateAIApp: App {
    @State private var appModel = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appModel)
                .preferredColorScheme(appModel.theme.colorSchemeOverride)
        }
    }
}
