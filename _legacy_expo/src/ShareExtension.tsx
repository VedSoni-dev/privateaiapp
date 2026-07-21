/**
 * ShareExtension — the compact view iOS shows when the user shares text/a
 * URL into Private AI from another app (e.g. selecting messages in Messages
 * and tapping Share). Deliberately minimal: preview what was shared, then
 * hand off to the main app rather than trying to run a full chat here.
 *
 * This file is a SEPARATE JS bundle entry (registered in index.share.js) that
 * runs inside the iOS Share Extension process, not the main app — it can't
 * import anything that touches the main app's native modules (Live Activity,
 * purchases, etc.) or assume AsyncStorage/backend state is available.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { close, openHostApp } from 'expo-share-extension';
import { AppColors, Fonts } from './theme';

interface Props {
  text?: string;
  url?: string;
}

function truncate(s: string, n: number): string {
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length > n ? `${clean.slice(0, n - 1)}…` : clean;
}

export default function ShareExtension({ text, url }: Props) {
  const shared = text || url || '';
  const preview = truncate(shared, 400);

  const askPrivateAI = () => {
    // Handoff only — the main app receives this via its own `privateai://`
    // scheme (React Navigation linking config in App.tsx) and does the real
    // work. Query key must match the `parse` key there (sharedText).
    openHostApp(`share?sharedText=${encodeURIComponent(shared)}`);
  };

  return (
    <View style={styles.container}>
      <View style={styles.sheet}>
        <View style={styles.iconRing}>
          <Text style={styles.icon}>🛡️</Text>
        </View>
        <Text style={styles.title}>Ask Private AI</Text>
        <ScrollView style={styles.previewBox} bounces={false}>
          <Text style={styles.previewText}>{preview || 'Nothing to share'}</Text>
        </ScrollView>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={askPrivateAI}
          disabled={!shared}
          accessibilityRole="button"
          accessibilityLabel="Ask Private AI about this"
        >
          <Text style={styles.primaryButtonText}>Ask Private AI</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => close()}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: AppColors.primaryDark,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
    alignItems: 'center',
  },
  iconRing: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: AppColors.accentCyan + '16',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  icon: { fontSize: 26 },
  title: {
    fontFamily: Fonts.satoshiBold,
    fontSize: 19,
    color: AppColors.textPrimary,
    marginBottom: 14,
  },
  previewBox: {
    width: '100%',
    maxHeight: 140,
    backgroundColor: AppColors.surfaceCard,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppColors.border,
    padding: 14,
    marginBottom: 18,
  },
  previewText: {
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  primaryButton: {
    width: '100%',
    paddingVertical: 15,
    backgroundColor: AppColors.accentCyan,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: AppColors.surfaceCard,
  },
  cancelButton: { paddingVertical: 8 },
  cancelButtonText: { fontSize: 14, color: AppColors.textMuted },
});
