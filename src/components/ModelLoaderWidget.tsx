import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { AppColors, Fonts } from '../theme';

interface ModelLoaderWidgetProps {
  title: string;
  subtitle: string;
  icon: string;
  accentColor: string;
  isDownloading: boolean;
  isLoading: boolean;
  progress: number;
  onLoad: () => void;
}

export const ModelLoaderWidget: React.FC<ModelLoaderWidgetProps> = ({
  accentColor,
  isDownloading,
  isLoading,
  progress,
  onLoad,
}) => {
  const pct = Math.round(progress);

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <View style={[styles.iconRing, { backgroundColor: accentColor + '18' }]}>
          <Text style={styles.iconEmoji}>🛡️</Text>
        </View>

        <Text style={styles.headline}>
          {isDownloading ? 'Setting up\nyour private AI…' :
           isLoading    ? 'Loading model…' :
                          'Ready to set up'}
        </Text>

        <Text style={styles.sub}>
          {isDownloading
            ? `Downloading the Qwen2.5 AI model (${pct}%). This only happens once — Wi-Fi recommended.`
            : isLoading
            ? 'Initializing the model on-device. Nearly there.'
            : 'Download the Qwen2.5 3B language model (~1.9 GB) to get started. This only happens once.'}
        </Text>

        {isDownloading && (
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${pct}%` as any, backgroundColor: accentColor },
                ]}
              />
            </View>
            <Text style={[styles.progressPct, { color: accentColor }]}>{pct}%</Text>
          </View>
        )}

        {isLoading && (
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  styles.indeterminate,
                  { backgroundColor: accentColor },
                ]}
              />
            </View>
          </View>
        )}

        {!isDownloading && !isLoading && (
          <TouchableOpacity
            onPress={onLoad}
            activeOpacity={0.85}
            style={[styles.cta, { backgroundColor: accentColor }]}
          >
            <Text style={styles.ctaText}>Download & Start →</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.features}>
        {[
          { icon: '🔒', text: 'Never leaves your phone' },
          { icon: '📵', text: 'Works without internet' },
          { icon: '🆓', text: 'No account. Free forever.' },
        ].map(f => (
          <View key={f.text} style={styles.featureRow}>
            <Text style={styles.featureIcon}>{f.icon}</Text>
            <Text style={styles.featureText}>{f.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
    paddingBottom: 48,
    paddingTop: 16,
  },
  top: {
    flex: 1,
    justifyContent: 'center',
  },
  iconRing: {
    width: 88,
    height: 88,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  iconEmoji: {
    fontSize: 44,
  },
  headline: {
    fontFamily: Fonts.satoshi,
    fontSize: 36,
    lineHeight: 44,
    color: AppColors.textPrimary,
    marginBottom: 14,
    letterSpacing: 0.1,
  },
  sub: {
    fontSize: 15.5,
    color: AppColors.textSecondary,
    lineHeight: 23,
    marginBottom: 32,
  },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  progressTrack: {
    flex: 1,
    height: 7,
    backgroundColor: AppColors.surfaceCard,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppColors.border,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  indeterminate: {
    width: '45%',
    opacity: 0.8,
  },
  progressPct: {
    fontSize: 13,
    fontWeight: '600',
    minWidth: 38,
  },
  cta: {
    paddingVertical: 17,
    borderRadius: 16,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 4,
    shadowColor: AppColors.accentCyan,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  features: {
    gap: 14,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: AppColors.surfaceCard,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppColors.border,
  },
  featureIcon: {
    fontSize: 20,
  },
  featureText: {
    fontSize: 15,
    color: AppColors.textPrimary,
    fontWeight: '500',
  },
});
