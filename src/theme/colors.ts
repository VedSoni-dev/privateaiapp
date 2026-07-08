import { Platform } from 'react-native';

/**
 * Crimson and cream theme - warm paper, deep berry text, and a muted
 * crimson accent. The names stay stable so the rest of the app can keep
 * referencing the same semantic tokens.
 */
export const AppColors = {
  // Backgrounds - cream / ivory / paper
  primaryDark:    '#f7eee6',   // main canvas
  primaryMid:     '#f0e0d4',   // elevated sections, panels
  surfaceCard:    '#fff9f4',   // cards, user bubbles, inputs
  surfaceElevated:'#f5e8dc',   // raised surfaces

  // Accent - crimson family
  accentCyan:    '#8f1d31',    // primary crimson
  accentViolet:  '#b03b4d',    // lighter crimson
  accentPink:    '#a42c40',
  accentGreen:   '#356b4f',    // muted evergreen
  accentOrange:  '#b66a2f',    // warm clay

  // Text - berry / ink / smoke
  textPrimary:   '#30171b',
  textSecondary: '#6f5559',
  textMuted:     '#7a6165',   // darkened from #8d7377: 4.9:1 on cream (WCAG AA)

  // Status
  success: '#356b4f',
  warning: '#b66a2f',
  error:   '#ad3549',
  info:    '#7a4c57',

  // Borders - warm paper tone
  border:       '#dbc3b8',
  borderStrong: '#c9a99e',
} as const;

export type AppColorsType = typeof AppColors;

export const Fonts = {
  satoshi: 'Satoshi-Regular',
  satoshiMedium: 'Satoshi-Medium',
  satoshiBold: 'Satoshi-Bold',
  sans: 'Satoshi-Regular',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
} as const;
