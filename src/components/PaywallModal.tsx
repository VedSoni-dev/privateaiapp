import React from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet,
  SafeAreaView, ScrollView,
} from 'react-native';
import { AppColors, Fonts } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubscribe: () => void;
  messagesUsed: number;
  limit: number;
}

const FEATURES_FREE = [
  '20 messages per day',
  'Local AI — fully private',
  'Web search',
  'Long-term memory',
  'File attachments',
];

const FEATURES_PRO = [
  'Unlimited messages',
  'Everything in Free',
  'Cloud AI models (GPT-4 class) — coming soon',
  'Cloud memory sync — coming soon',
  'Priority support',
];

export const PaywallModal: React.FC<Props> = ({
  visible, onClose, onSubscribe, messagesUsed, limit,
}) => (
  <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeTxt}>✕</Text>
        </TouchableOpacity>

        <View style={styles.iconRing}>
          <Text style={styles.icon}>🛡️</Text>
        </View>

        <Text style={styles.headline}>You've used {messagesUsed}/{limit} free messages today</Text>
        <Text style={styles.sub}>
          Upgrade to Pro for unlimited messages and upcoming cloud AI features.
        </Text>

        <View style={styles.plans}>
          {/* Free */}
          <View style={styles.planCard}>
            <Text style={styles.planName}>Free</Text>
            <Text style={styles.planPrice}>$0</Text>
            {FEATURES_FREE.map(f => (
              <View key={f} style={styles.featureRow}>
                <Text style={styles.featureCheck}>✓</Text>
                <Text style={styles.featureTxt}>{f}</Text>
              </View>
            ))}
          </View>

          {/* Pro */}
          <View style={[styles.planCard, styles.planCardPro]}>
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeTxt}>BEST VALUE</Text>
            </View>
            <Text style={[styles.planName, { color: '#fff' }]}>Pro</Text>
            <View style={styles.priceRow}>
              <Text style={[styles.planPrice, { color: '#fff' }]}>$4.99</Text>
              <Text style={styles.pricePer}>/month</Text>
            </View>
            {FEATURES_PRO.map(f => (
              <View key={f} style={styles.featureRow}>
                <Text style={[styles.featureCheck, { color: AppColors.accentCyan + 'CC' }]}>✓</Text>
                <Text style={[styles.featureTxt, { color: 'rgba(255,255,255,0.85)' }]}>{f}</Text>
              </View>
            ))}
          </View>
        </View>

        <TouchableOpacity
          onPress={onSubscribe}
          activeOpacity={0.85}
          style={styles.cta}
        >
          <Text style={styles.ctaTxt}>Start Pro — $4.99/month</Text>
        </TouchableOpacity>

        <Text style={styles.legal}>
          Cancel anytime. Billed monthly via App Store.{'\n'}
          Subscription auto-renews unless cancelled 24h before renewal.
        </Text>

        <TouchableOpacity onPress={onClose} style={styles.maybeLater}>
          <Text style={styles.maybeLaterTxt}>Maybe later</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  </Modal>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.primaryDark },
  scroll: { paddingHorizontal: 24, paddingBottom: 40, alignItems: 'center' },
  closeBtn: {
    alignSelf: 'flex-end',
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: AppColors.surfaceCard,
    justifyContent: 'center', alignItems: 'center',
    marginTop: 8, marginBottom: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppColors.border,
  },
  closeTxt: { fontSize: 14, color: AppColors.textSecondary, fontWeight: '600' },
  iconRing: {
    width: 80, height: 80, borderRadius: 26,
    backgroundColor: AppColors.accentCyan + '18',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 20,
  },
  icon: { fontSize: 40 },
  headline: {
    fontFamily: Fonts.satoshi,
    fontSize: 26, lineHeight: 34,
    color: AppColors.textPrimary,
    textAlign: 'center', marginBottom: 10,
  },
  sub: {
    fontSize: 15, color: AppColors.textSecondary,
    textAlign: 'center', lineHeight: 22, marginBottom: 28,
  },
  plans: { width: '100%', gap: 12, marginBottom: 24 },
  planCard: {
    width: '100%', padding: 20,
    backgroundColor: AppColors.surfaceCard,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppColors.border,
  },
  planCardPro: {
    backgroundColor: AppColors.textPrimary,
    borderColor: 'transparent',
  },
  proBadge: {
    alignSelf: 'flex-start',
    backgroundColor: AppColors.accentCyan + '30',
    paddingHorizontal: 9, paddingVertical: 3,
    borderRadius: 6, marginBottom: 10,
  },
  proBadgeTxt: {
    fontSize: 10, fontWeight: '800',
    color: AppColors.accentCyan, letterSpacing: 0.8,
  },
  planName: {
    fontSize: 17, fontWeight: '700',
    color: AppColors.textPrimary, marginBottom: 2,
  },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3, marginBottom: 14 },
  planPrice: {
    fontFamily: Fonts.satoshi,
    fontSize: 32, color: AppColors.textPrimary, marginBottom: 14,
  },
  pricePer: { fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 14 },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  featureCheck: { fontSize: 13, color: AppColors.accentGreen, fontWeight: '700', marginTop: 1 },
  featureTxt: { fontSize: 14, color: AppColors.textPrimary, flex: 1, lineHeight: 20 },
  cta: {
    width: '100%', paddingVertical: 17,
    backgroundColor: AppColors.accentCyan,
    borderRadius: 16, alignItems: 'center',
    shadowColor: AppColors.accentCyan,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 4,
    marginBottom: 14,
  },
  ctaTxt: { fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },
  legal: {
    fontSize: 11.5, color: AppColors.textMuted,
    textAlign: 'center', lineHeight: 17, marginBottom: 16,
  },
  maybeLater: { paddingVertical: 8 },
  maybeLaterTxt: { fontSize: 14, color: AppColors.textMuted },
});
