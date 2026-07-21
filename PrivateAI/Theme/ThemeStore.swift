import SwiftUI

enum ThemeMode: String, CaseIterable, Identifiable {
    case system, light, dark
    var id: String { rawValue }

    var title: String {
        switch self {
        case .system: return "System"
        case .light: return "Light"
        case .dark: return "Dark"
        }
    }
}

@MainActor
@Observable
final class ThemeStore {
    var mode: ThemeMode {
        didSet { UserDefaults.standard.set(mode.rawValue, forKey: "theme_mode") }
    }

    /// Updated from the root view's `@Environment(\.colorScheme)` when mode == .system.
    var systemScheme: ColorScheme = .light

    var colors: AppColors {
        switch mode {
        case .light: return .light
        case .dark: return .dark
        case .system: return systemScheme == .dark ? .dark : .light
        }
    }

    /// Nil means follow the system (don't force preferredColorScheme).
    var colorSchemeOverride: ColorScheme? {
        switch mode {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }

    init() {
        let raw = UserDefaults.standard.string(forKey: "theme_mode") ?? "system"
        self.mode = ThemeMode(rawValue: raw) ?? .system
    }
}
