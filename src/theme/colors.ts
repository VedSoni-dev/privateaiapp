/**
 * Private AI palette — "Claude × Apple", light and white-forward.
 *
 * Pure-white canvas (Apple clarity) with warm ivory surfaces and a Claude clay
 * accent. Key names are kept stable so the whole app re-skins from this file.
 */
import { Platform } from 'react-native';

export const AppColors = {
  // Backgrounds — white canvas, warm ivory surfaces
  primaryDark: '#FFFFFF', // main canvas
  primaryMid: '#F6F4EE', // warm ivory section
  surfaceCard: '#F4F1EA', // ivory cards / inputs / assistant bubbles
  surfaceElevated: '#FFFFFF',

  // Accents — Claude clay/coral family
  accentCyan: '#C45B3C', // primary accent (kept name for compatibility)
  accentViolet: '#E08A63', // lighter coral for gradients
  accentPink: '#C45B3C',
  accentGreen: '#3F8F6F',
  accentOrange: '#C9893E',

  // Text — warm near-black (Apple-like), soft warm grays
  textPrimary: '#1A1916',
  textSecondary: '#6B665C',
  textMuted: '#A39D91',

  // Status
  success: '#3F8F6F',
  warning: '#C9893E',
  error: '#C24A3E',
  info: '#3B6FC9',

  // Hairlines / borders
  border: '#E7E3D9',
  borderStrong: '#DAD5C8',
} as const;

export type AppColorsType = typeof AppColors;

/**
 * Typography — a serif display face (Claude wordmark energy) paired with the
 * native system sans (SF Pro on iOS) for body text. System fonts only, so no
 * native rebuild is needed.
 */
export const Fonts = {
  serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
  sans: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
  mono: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'monospace',
  }),
} as const;
