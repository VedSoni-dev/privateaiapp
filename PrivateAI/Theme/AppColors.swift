import SwiftUI

/// Crimson lock-bubble brand — matched to the app icon (glass on ruby).
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
        canvas: Color(hex: 0xF8F2F0),
        canvasSecondary: Color(hex: 0xF0E4E1),
        elevated: Color(hex: 0xFFF9F7),
        card: Color(hex: 0xFFFFFF),
        accent: Color(hex: 0xB01C2E),
        accentSoft: Color(hex: 0xD64557),
        textPrimary: Color(hex: 0x2A1218),
        textSecondary: Color(hex: 0x6B4A50),
        textMuted: Color(hex: 0x8A6A70),
        border: Color(hex: 0xE2CFCB),
        success: Color(hex: 0x356B4F),
        error: Color(hex: 0xAD3549)
    )

    static let dark = AppColors(
        canvas: Color(hex: 0x16090C),
        canvasSecondary: Color(hex: 0x241014),
        elevated: Color(hex: 0x2C151A),
        card: Color(hex: 0x351A20),
        accent: Color(hex: 0xE85264),
        accentSoft: Color(hex: 0xF07A88),
        textPrimary: Color(hex: 0xF7ECEA),
        textSecondary: Color(hex: 0xD0B4B8),
        textMuted: Color(hex: 0xA8888E),
        border: Color(hex: 0x4A2A30),
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
