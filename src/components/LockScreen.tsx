import React, { useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Fonts, useTheme, type AppColorsType } from '../theme';

interface LockScreenProps {
  /** Called when the user taps Unlock (or on mount for the auto-prompt). */
  onRequestUnlock: () => void;
}

/**
 * Fully opaque cover shown while the app is locked — hiding the chat content
 * is the point, so no translucency. Rendered above the navigator; the app
 * stays mounted (and any in-flight stream keeps running) underneath.
 */
export const LockScreen: React.FC<LockScreenProps> = ({ onRequestUnlock }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Prompt as soon as the cover appears so unlocking is usually zero-tap.
  useEffect(() => {
    onRequestUnlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.cover}>
      <Image
        source={require('../../assets/shield-96.png')}
        style={styles.logo}
        accessibilityLabel="Private AI"
      />
      <Text style={styles.title}>Locked</Text>
      <Text style={styles.sub}>Your conversations stay private.</Text>
      <TouchableOpacity
        onPress={onRequestUnlock}
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel="Unlock with Face ID"
      >
        <Text style={styles.buttonText}>Unlock</Text>
      </TouchableOpacity>
    </View>
  );
};

const createStyles = (colors: AppColorsType) => StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
  logo: { width: 64, height: 64, borderRadius: 16, marginBottom: 20 },
  title: {
    fontFamily: Fonts.satoshiBold,
    fontSize: 24,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  sub: { fontSize: 14, color: colors.textMuted, marginBottom: 28 },
  button: {
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.accentCyan,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
