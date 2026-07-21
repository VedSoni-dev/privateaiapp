import { Platform } from 'react-native';

/**
 * Crimson and cream theme - warm paper, deep berry text, and a muted
 * crimson accent. The names stay stable across light/dark so the rest of
 * the app can keep referencing the same semantic tokens regardless of mode.
 */
export const LightColors = {
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

// Same crimson-and-cream identity, inverted for a dark canvas. Every pair
// used for body/muted text against a background has been checked to clear
// WCAG AA (4.5:1) — see the contrast check run when this was added.
export const DarkColors = {
  // Backgrounds - warm near-black, not pure/cold black
  primaryDark:    '#1c1416',
  primaryMid:     '#251b1e',
  surfaceCard:    '#2c2124',
  surfaceElevated:'#342629',

  // Accent - brightened crimson family so it still pops on a dark canvas
  accentCyan:    '#e14f68',
  accentViolet:  '#e97891',
  accentPink:    '#e15b74',
  accentGreen:   '#6bab8a',
  accentOrange:  '#dd9a5f',

  // Text - cream / warm smoke
  textPrimary:   '#f3e8e2',
  textSecondary: '#cbb3ac',
  textMuted:     '#9c8079',   // 4.98:1 on primaryDark (WCAG AA)

  // Status
  success: '#6bab8a',
  warning: '#dd9a5f',
  error:   '#e2637a',
  info:    '#c2a0a8',

  // Borders
  border:       '#3d2c2f',
  borderStrong: '#4f3639',
} as const;

// Widened to plain `string` per key (rather than `typeof LightColors`, whose
// `as const` literals would force DarkColors to match LightColors' exact
// hex values) — this just requires the same keys, any hex value.
export type AppColorsType = { [K in keyof typeof LightColors]: string };

// Back-compat alias — most of the app is mid-migration to useTheme() and
// still imports AppColors directly; those spots render in light mode only
// until converted. Prefer useTheme().colors in anything new.
export const AppColors = LightColors;

export const Fonts = {
  satoshi: 'Satoshi-Regular',
  satoshiMedium: 'Satoshi-Medium',
  satoshiBold: 'Satoshi-Bold',
  sans: 'Satoshi-Regular',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
} as const;
