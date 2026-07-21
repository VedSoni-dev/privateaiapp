import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  Modal,
  Share,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Fonts, useTheme, type AppColorsType } from '../theme';
import * as SafeHaptics from '../services/HapticsService';

export interface ShareCardTarget {
  question: string;
  answer: string;
}

interface ShareCardModalProps {
  visible: boolean;
  target: ShareCardTarget | null;
  onClose: () => void;
}

// The card ships as an image into other people's feeds and group chats, so
// it keeps one fixed brand look (the dark crimson identity) no matter which
// theme the sender uses — every shared card should be recognizably the same
// app.
const Card = {
  bg: '#1c1416',
  surface: '#2c2124',
  border: '#3d2c2f',
  crimson: '#e14f68',
  crimsonDeep: '#8f1d31',
  crimsonSoft: '#e97891',
  text: '#f3e8e2',
  textSoft: '#cbb3ac',
  muted: '#9c8079',
} as const;

const CARD_WIDTH = Math.min(Dimensions.get('window').width - 48, 360);

// The card footer and the plain-text share both point here — every shared
// answer is an install funnel. The id is the App Store Connect "Apple ID"
// for this app (same one as eas.json's ascAppId); the URL is valid the
// moment the app record exists, even before the app is approved.
const APP_STORE_URL = 'https://apps.apple.com/app/id6785089361';
// What actually gets printed on the card — short and typeable beats a full
// https:// URL in an image.
const APP_STORE_URL_DISPLAY = APP_STORE_URL.replace(/^https?:\/\//, '');

// Markdown reads fine in the chat, but raw **stars** and ## hashes look
// broken baked into an image — flatten to plain text for the card.
function stripMarkdown(md: string): string {
  return md
    .replace(/```\w*\n?([\s\S]*?)```/g, (_, code) => code.trim())
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*\*|__)([\s\S]*?)\1/g, '$2')
    .replace(/(^|\s)(\*|_)([^*_\n]+)\2/g, '$1$3')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Cut at a word boundary so the card never ends mid-word.
function truncate(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return { text: cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trimEnd() + '…', truncated: true };
}

export const ShareCardModal: React.FC<ShareCardModalProps> = ({ visible, target, onClose }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const cardRef = useRef<View>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState('');

  const question = useMemo(
    () => truncate(stripMarkdown(target?.question ?? ''), 220),
    [target?.question],
  );
  const answer = useMemo(
    () => truncate(stripMarkdown(target?.answer ?? ''), 700),
    [target?.answer],
  );

  const handleShare = async () => {
    if (isSharing) return;
    setIsSharing(true);
    setShareError('');
    void SafeHaptics.impactLight();
    try {
      // Lazily required per this app's native-module convention. Both are
      // bundled in Expo Go, but a require failure should degrade to sharing
      // plain text rather than crashing.
      const { captureRef } = require('react-native-view-shot');
      const uri: string = await captureRef(cardRef, { format: 'png', quality: 1 });
      try {
        const Sharing = require('expo-sharing');
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share this answer' });
        } else {
          await Share.share({ url: uri });
        }
      } catch {
        await Share.share({ url: uri });
      }
      void SafeHaptics.notificationSuccess();
      onClose();
    } catch (error) {
      console.warn('[ShareCard] capture failed:', String((error as Error)?.message ?? error));
      // Image capture unavailable — offer the plain-text share sheet instead.
      try {
        await Share.share({
          message: `${question.text}\n\n${answer.text}\n\n— answered privately by Private AI${APP_STORE_URL ? `\n${APP_STORE_URL}` : ''}`,
        });
        onClose();
      } catch {
        setShareError("Couldn't open the share sheet. Try again.");
      }
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* The exact pixels below are what gets captured and shared. */}
          <View ref={cardRef} collapsable={false} style={cardStyles.card}>
            <LinearGradient
              colors={[Card.crimsonDeep, Card.crimson, Card.crimsonDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={cardStyles.accentStrip}
            />
            <View style={cardStyles.inner}>
              <View style={cardStyles.header}>
                <Image source={require('../../assets/shield-48.png')} style={cardStyles.logo} />
                <Text style={cardStyles.wordmark}>Private AI</Text>
                <View style={cardStyles.badge}>
                  <Text style={cardStyles.badgeText}>CONFIDENTIAL</Text>
                </View>
              </View>

              <Text style={cardStyles.label}>ASKED PRIVATELY</Text>
              <Text style={cardStyles.question}>{question.text}</Text>

              <View style={cardStyles.divider} />

              <Text style={cardStyles.answer}>{answer.text}</Text>
              {answer.truncated && (
                <Text style={cardStyles.continued}>— full answer in the app</Text>
              )}

              <View style={cardStyles.footer}>
                <Text style={cardStyles.footerTagline}>Ask anything. Privately.</Text>
                <Text style={cardStyles.footerApp}>
                  {APP_STORE_URL_DISPLAY || 'Private AI for iPhone'}
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>

        {!!shareError && <Text style={styles.errorText}>{shareError}</Text>}

        <View style={[styles.actions, { paddingBottom: 34 }]}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.cancelBtn}
            accessibilityRole="button"
            accessibilityLabel="Cancel sharing"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => void handleShare()}
            disabled={isSharing}
            accessibilityRole="button"
            accessibilityLabel="Share this card as an image"
            accessibilityState={{ disabled: isSharing }}
            style={styles.shareBtnWrap}
          >
            <LinearGradient
              colors={[colors.accentCyan, colors.accentViolet]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.shareBtn, isSharing && { opacity: 0.6 }]}
            >
              <Text style={styles.shareText}>{isSharing ? 'Preparing…' : 'Share Image'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// Fixed brand palette on purpose — see the Card comment above.
const cardStyles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: Card.bg,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Card.border,
  },
  accentStrip: { height: 4 },
  inner: { padding: 22 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 20,
  },
  logo: { width: 26, height: 26, borderRadius: 7 },
  wordmark: {
    fontFamily: Fonts.satoshiBold,
    fontSize: 15,
    color: Card.text,
    letterSpacing: 0.2,
    flex: 1,
  },
  badge: {
    borderWidth: 1,
    borderColor: Card.crimson + '55',
    backgroundColor: Card.crimson + '14',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: Card.crimson,
    letterSpacing: 1.1,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: Card.muted,
    letterSpacing: 1.2,
    marginBottom: 7,
  },
  question: {
    fontFamily: Fonts.satoshiBold,
    fontSize: 17,
    lineHeight: 24,
    color: Card.text,
  },
  divider: {
    height: 1,
    backgroundColor: Card.border,
    marginVertical: 16,
  },
  answer: {
    fontFamily: Fonts.sans,
    fontSize: 14.5,
    lineHeight: 23,
    color: Card.textSoft,
  },
  continued: {
    fontSize: 12,
    color: Card.muted,
    fontStyle: 'italic',
    marginTop: 8,
  },
  footer: {
    marginTop: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Card.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerTagline: {
    fontFamily: Fonts.satoshiMedium,
    fontSize: 12.5,
    color: Card.crimsonSoft,
  },
  footerApp: {
    fontSize: 11,
    color: Card.muted,
  },
});

const createStyles = (colors: AppColorsType) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 32,
  },
  errorText: {
    textAlign: 'center',
    color: colors.error,
    fontSize: 12.5,
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 24,
  },
  cancelBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  shareBtnWrap: { flex: 2 },
  shareBtn: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
});
