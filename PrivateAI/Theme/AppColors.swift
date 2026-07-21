import SwiftUI

struct AppColors {
    let canvas: Color
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
        canvas: Color(hex: 0xF7EEE6),
        elevated: Color(hex: 0xF0E0D4),
        card: Color(hex: 0xFFF9F4),
        accent: Color(hex: 0x8F1D31),
        accentSoft: Color(hex: 0xB03B4D),
        textPrimary: Color(hex: 0x30171B),
        textSecondary: Color(hex: 0x6F5559),
        textMuted: Color(hex: 0x7A6165),
        border: Color(hex: 0xDBC3B8),
        success: Color(hex: 0x356B4F),
        error: Color(hex: 0xAD3549)
    )

    static let dark = AppColors(
        canvas: Color(hex: 0x1C1416),
        elevated: Color(hex: 0x251B1E),
        card: Color(hex: 0x2C2124),
        accent: Color(hex: 0xE14F68),
        accentSoft: Color(hex: 0xE97891),
        textPrimary: Color(hex: 0xF3E8E2),
        textSecondary: Color(hex: 0xCBB3AC),
        textMuted: Color(hex: 0x9C8079),
        border: Color(hex: 0x3D2C2F),
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
