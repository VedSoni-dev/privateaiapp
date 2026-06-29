import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  SafeAreaView,
  Image,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import RNFS from 'react-native-fs';
import { AppColors, Fonts } from '../theme';
import { RootStackParamList } from '../navigation/types';

const { width: W } = Dimensions.get('window');
const ONBOARDING_FLAG = `${RNFS.DocumentDirectoryPath}/onboarding-done.json`;

export async function checkOnboardingDone(): Promise<boolean> {
  try {
    return await RNFS.exists(ONBOARDING_FLAG);
  } catch {
    return false;
  }
}

async function markOnboardingDone(): Promise<void> {
  try {
    await RNFS.writeFile(ONBOARDING_FLAG, '1', 'utf8');
  } catch {}
}

type Props = { navigation: StackNavigationProp<RootStackParamList, 'Onboarding'> };

const slides = [
  {
    icon: '🛡️',
    title: 'ChatGPT.\nWithout the cloud.',
    body: 'Private AI runs entirely on your iPhone. No account. No subscription. No data leaving your phone — ever.',
    accent: AppColors.accentCyan,
  },
  {
    icon: '🔒',
    title: 'Your data,\nyour rules.',
    body: null,
    features: [
      { icon: '✓', text: 'No internet required after setup' },
      { icon: '✓', text: 'No account or sign-in needed' },
      { icon: '✓', text: 'All messages stay on this device' },
      { icon: '✓', text: 'Web search: only your query leaves (opt-in)' },
      { icon: '✓', text: 'Free. Forever.' },
    ],
    accent: AppColors.accentGreen,
  },
  {
    icon: '🧠',
    title: 'It remembers\nyou.',
    body: 'Private AI learns your name, projects, and preferences across conversations — all stored locally, never uploaded anywhere.',
    accent: AppColors.accentOrange,
  },
];

export const OnboardingScreen: React.FC<Props> = ({ navigation }) => {
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);

  const goNext = async () => {
    if (page < slides.length - 1) {
      scrollRef.current?.scrollTo({ x: (page + 1) * W, animated: true });
      setPage(page + 1);
    } else {
      await markOnboardingDone();
      navigation.replace('Chat');
    }
  };

  const onScroll = (e: any) => {
    const p = Math.round(e.nativeEvent.contentOffset.x / W);
    setPage(p);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        scrollEventThrottle={16}
      >
        {slides.map((slide, i) => (
          <View key={i} style={styles.slide}>
            <View style={[styles.iconRing, { backgroundColor: slide.accent + '18' }]}>
              <Text style={styles.iconEmoji}>{slide.icon}</Text>
            </View>

            <Text style={styles.title}>{slide.title}</Text>

            {slide.body ? (
              <Text style={styles.body}>{slide.body}</Text>
            ) : null}

            {slide.features ? (
              <View style={styles.featureList}>
                {slide.features.map((f, fi) => (
                  <View key={fi} style={styles.featureRow}>
                    <View style={[styles.checkCircle, { backgroundColor: slide.accent + '20' }]}>
                      <Text style={[styles.checkIcon, { color: slide.accent }]}>{f.icon}</Text>
                    </View>
                    <Text style={styles.featureText}>{f.text}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {slides.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === page && { backgroundColor: AppColors.accentCyan, width: 22 },
              ]}
            />
          ))}
        </View>

        <TouchableOpacity
          onPress={goNext}
          activeOpacity={0.85}
          style={[styles.cta, { backgroundColor: AppColors.accentCyan }]}
        >
          <Text style={styles.ctaText}>
            {page < slides.length - 1 ? 'Next →' : 'Get started →'}
          </Text>
        </TouchableOpacity>

        {page < slides.length - 1 && (
          <TouchableOpacity
            onPress={async () => {
              await markOnboardingDone();
              navigation.replace('Chat');
            }}
            style={styles.skip}
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: AppColors.primaryDark,
  },
  slide: {
    width: W,
    flex: 1,
    paddingHorizontal: 36,
    justifyContent: 'center',
    paddingBottom: 40,
  },
  iconRing: {
    width: 100,
    height: 100,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 36,
    alignSelf: 'flex-start',
  },
  iconEmoji: {
    fontSize: 52,
  },
  title: {
    fontFamily: Fonts.satoshi,
    fontSize: 38,
    lineHeight: 46,
    color: AppColors.textPrimary,
    marginBottom: 18,
    letterSpacing: 0.1,
  },
  body: {
    fontSize: 17,
    lineHeight: 26,
    color: AppColors.textSecondary,
  },
  featureList: {
    gap: 14,
    marginTop: 4,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  checkCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkIcon: {
    fontSize: 14,
    fontWeight: '700',
  },
  featureText: {
    fontSize: 16,
    color: AppColors.textPrimary,
    flex: 1,
    lineHeight: 22,
  },
  footer: {
    paddingHorizontal: 36,
    paddingBottom: 28,
    gap: 16,
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 7,
    marginBottom: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: AppColors.borderStrong,
  },
  cta: {
    width: '100%',
    paddingVertical: 17,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: AppColors.accentCyan,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 4,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  skip: {
    paddingVertical: 8,
  },
  skipText: {
    fontSize: 14,
    color: AppColors.textMuted,
  },
});
