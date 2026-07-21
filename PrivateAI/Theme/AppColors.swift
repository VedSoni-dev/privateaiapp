import SwiftUI

/// Ink + seal teal — privacy / confidential-compute identity (not cream/crimson).
struct AppColors {
    let canvas: Color
    let canvasSecondary: Color
    let elevated: Color
    let card: Color
    let accent: Color
    let accentSoft: Color
    let textPrimary: Color
    let textSecondary: Color
    let textMuted: Color
    let border: Color
    let success: Color
    let error: Color

    static let light = AppColors(
        canvas: Color(hex: 0xF2F5F7),
        canvasSecondary: Color(hex: 0xE4ECF0),
        elevated: Color(hex: 0xFFFFFF),
        card: Color(hex: 0xFFFFFF),
        accent: Color(hex: 0x1A8B9A),
        accentSoft: Color(hex: 0x2EC4B6),
        textPrimary: Color(hex: 0x0E1A22),
        textSecondary: Color(hex: 0x4A5B66),
        textMuted: Color(hex: 0x6B7C87),
        border: Color(hex: 0xC9D5DC),
        success: Color(hex: 0x2F7A5B),
        error: Color(hex: 0xC23B4E)
    )

    static let dark = AppColors(
        canvas: Color(hex: 0x0E1A22),
        canvasSecondary: Color(hex: 0x15242E),
        elevated: Color(hex: 0x1A2B36),
        card: Color(hex: 0x1F3340),
        accent: Color(hex: 0x4AD1B6),
        accentSoft: Color(hex: 0x7AE0CC),
        textPrimary: Color(hex: 0xEAF2F6),
        textSecondary: Color(hex: 0xA8BBC6),
        textMuted: Color(hex: 0x7A909C),
        border: Color(hex: 0x2A3F4C),
        success: Color(hex: 0x6BAB8A),
        error: Color(hex: 0xE2637A)
    )
}

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}
