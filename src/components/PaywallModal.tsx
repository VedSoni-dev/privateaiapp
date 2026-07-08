import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Linking,
} from 'react-native';
import { AppColors, Fonts } from '../theme';

// App Store guideline 3.1.2: paywalls must link Terms of Use and Privacy Policy.
const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const PRIVACY_URL = 'https://github.com/VedSoni-dev/privateaiapp/blob/main/PRIVACY.md';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubscribe: () => void;
  onRestore: () => void;
  messagesUsed: number;
  limit: number;
}

const FEATURES_FREE = [
  '20 messages per day',
  'Web search',
  'Local chat history',
  'Editable memory',
  'Confidential cloud inference',
];

const FEATURES_PRO = [
  'Unlimited messages',
  'Everything in Free',
  'Higher daily search capacity',
  'Longer context windows',
  'Priority support',
];

export const PaywallModal: React.FC<Props> = ({
  visible, onClose, onSubscribe, onRestore, messagesUsed, limit,
}) => (
  <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        <TouchableOpacity
          onPress={onClose}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Text style={styles.closeTxt}>✕</Text>
        </TouchableOpacity>

        <View style={styles.iconRing}>
          <Text style={styles.icon}>🛡️</Text>
        </View>

        <Text style={styles.headline}>You have used {messagesUsed}/{limit} free messages today</Text>
        <Text style={styles.sub}>
          Upgrade to Pro for unlimited messages, more search, and a bigger context window.
        </Text>

        <View style={styles.plans}>
          <View style={styles.planCard}>
            <Text style={styles.planName}>Free</Text>
            <Text style={styles.planPrice}>$0</Text>
            {FEATURES_FREE.map(feature => (
              <View key={feature} style={styles.featureRow}>
                <Text style={styles.featureCheck}>✓</Text>
                <Text style={styles.featureTxt}>{feature}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.planCard, styles.planCardPro]}>
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeTxt}>BEST VALUE</Text>
            </View>
            <Text style={[styles.planName, styles.planNamePro]}>Pro</Text>
            <View style={styles.priceRow}>
              <Text style={[styles.planPrice, styles.planPricePro]}>$4.99</Text>
              <Text style={[styles.pricePer, styles.pricePerPro]}>{'/month'}</Text>
            </View>
            {FEATURES_PRO.map(feature => (
              <View key={feature} style={styles.featureRow}>
                <Text style={styles.featureCheckPro}>✓</Text>
                <Text style={styles.featureTxtPro}>{feature}</Text>
              </View>
            ))}
          </View>
        </View>

        <TouchableOpacity
          onPress={onSubscribe}
          activeOpacity={0.85}
          style={styles.cta}
          accessibilityRole="button"
          accessibilityLabel="Start Pro subscription, $4.99 per month"
        >
          <Text style={styles.ctaTxt}>Start Pro - $4.99/month</Text>
        </TouchableOpacity>

        <Text style={styles.legal}>
          $4.99/month, billed via the App Store. Auto-renews monthly until cancelled.{'\n'}
          Cancel anytime in iOS Settings → your Apple ID → Subscriptions;{'\n'}
          cancel at least 24h before renewal to avoid the next charge.
        </Text>

        <TouchableOpacity
          onPress={onRestore}
          style={styles.restoreBtn}
          accessibilityRole="button"
          accessibilityLabel="Restore previous purchases"
        >
          <Text style={styles.restoreTxt}>Restore Purchases</Text>
        </TouchableOpacity>

        <View style={styles.legalLinks}>
          <TouchableOpacity
            onPress={() => Linking.openURL(TERMS_URL).catch(() => {})}
            accessibilityRole="link"
            accessibilityLabel="Terms of Use"
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          >
            <Text style={styles.legalLinkTxt}>Terms of Use</Text>
          </TouchableOpacity>
          <Text style={styles.legalLinkDot}>·</Text>
          <TouchableOpacity
            onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}
            accessibilityRole="link"
            accessibilityLabel="Privacy Policy"
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          >
            <Text style={styles.legalLinkTxt}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={onClose}
          style={styles.maybeLater}
          accessibilityRole="button"
          accessibilityLabel="Maybe later, continue with the free plan"
        >
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
    // 44x44 minimum touch target (Apple HIG / WCAG 2.5.5)
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: AppColors.surfaceCard,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppColors.border,
  },
  closeTxt: { fontSize: 14, color: AppColors.textSecondary, fontWeight: '600' },
  iconRing: {
    width: 80,
    height: 80,
    borderRadius: 26,
    backgroundColor: AppColors.accentCyan + '16',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  icon: { fontSize: 40 },
  headline: {
    fontFamily: Fonts.satoshi,
    fontSize: 26,
    lineHeight: 34,
    color: AppColors.textPrimary,
    textAlign: 'center',
    marginBottom: 10,
  },
  sub: {
    fontSize: 15,
    color: AppColors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  plans: { width: '100%', gap: 12, marginBottom: 24 },
  planCard: {
    width: '100%',
    padding: 20,
    backgroundColor: AppColors.surfaceCard,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppColors.border,
  },
  planCardPro: {
    backgroundColor: AppColors.accentCyan,
    borderColor: AppColors.accentCyan,
  },
  proBadge: {
    alignSelf: 'flex-start',
    backgroundColor: AppColors.surfaceCard + '26',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 10,
  },
  proBadgeTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: AppColors.surfaceCard,
    letterSpacing: 0.8,
  },
  planName: {
    fontSize: 17,
    fontWeight: '700',
    color: AppColors.textPrimary,
    marginBottom: 2,
  },
  planNamePro: { color: AppColors.surfaceCard },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    marginBottom: 14,
  },
  planPrice: {
    fontFamily: Fonts.satoshi,
    fontSize: 32,
    color: AppColors.textPrimary,
    marginBottom: 14,
  },
  planPricePro: { color: AppColors.surfaceCard },
  pricePer: { fontSize: 14, color: AppColors.textSecondary, marginBottom: 14 },
  pricePerPro: { color: AppColors.surfaceCard },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  featureCheck: {
    fontSize: 13,
    color: AppColors.accentCyan,
    fontWeight: '700',
    marginTop: 1,
  },
  featureCheckPro: {
    fontSize: 13,
    color: AppColors.surfaceCard,
    fontWeight: '700',
    marginTop: 1,
  },
  featureTxt: {
    fontSize: 14,
    color: AppColors.textPrimary,
    flex: 1,
    lineHeight: 20,
  },
  featureTxtPro: {
    fontSize: 14,
    color: AppColors.surfaceCard,
    flex: 1,
    lineHeight: 20,
  },
  cta: {
    width: '100%',
    paddingVertical: 17,
    backgroundColor: AppColors.accentCyan,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: AppColors.accentCyan,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: 14,
  },
  ctaTxt: {
    fontSize: 17,
    fontWeight: '700',
    color: AppColors.surfaceCard,
    letterSpacing: 0.2,
  },
  legal: {
    fontSize: 11.5,
    color: AppColors.textMuted,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 16,
  },
  restoreBtn: { paddingVertical: 10 },
  restoreTxt: { fontSize: 14, color: AppColors.accentCyan, fontWeight: '600' },
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  legalLinkTxt: { fontSize: 12, color: AppColors.textMuted, textDecorationLine: 'underline' },
  legalLinkDot: { fontSize: 12, color: AppColors.textMuted },
  maybeLater: { paddingVertical: 8 },
  maybeLaterTxt: { fontSize: 14, color: AppColors.textMuted },
});
