import { Platform } from 'react-native';

/**
 * shadcn/ui dark theme — zinc scale with coral accent.
 * Mirrors the shadcn CSS variables mapped to React Native.
 */
export const AppColors = {
  // Backgrounds — zinc-950 / zinc-900 / zinc-800
  primaryDark:    '#09090b',   // zinc-950  — main canvas
  primaryMid:     '#18181b',   // zinc-900  — elevated sections, panels
  surfaceCard:    '#27272a',   // zinc-800  — cards, user bubbles, inputs
  surfaceElevated:'#18181b',   // zinc-900

  // Accent — coral family (kept from original brand)
  accentCyan:    '#e5734a',    // coral primary
  accentViolet:  '#f09070',    // coral light
  accentPink:    '#e5734a',
  accentGreen:   '#22c55e',    // green-500
  accentOrange:  '#f59e0b',    // amber-500

  // Text — zinc scale
  textPrimary:   '#fafafa',    // zinc-50
  textSecondary: '#a1a1aa',    // zinc-400
  textMuted:     '#71717a',    // zinc-500

  // Status
  success: '#22c55e',
  warning: '#f59e0b',
  error:   '#ef4444',
  info:    '#3b82f6',

  // Borders — zinc-700 / zinc-600
  border:       '#3f3f46',     // zinc-700
  borderStrong: '#52525b',     // zinc-600
} as const;

export type AppColorsType = typeof AppColors;

export const Fonts = {
  satoshi: 'Satoshi',
  satoshiMedium: 'Satoshi-Medium',
  satoshiBold: 'Satoshi-Bold',
  sans: 'Satoshi',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
} as const;
