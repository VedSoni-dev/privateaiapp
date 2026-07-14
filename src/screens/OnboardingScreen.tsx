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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Fonts, useTheme, type AppColorsType } from '../theme';
import { RootStackParamList } from '../navigation/types';

const { width: W } = Dimensions.get('window');

export async function checkOnboardingDone(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem('@privateai/onboarding_done');
    return v === '1';
  } catch {
    return false;
  }
}

async function markOnboardingDone(): Promise<void> {
  try {
    await AsyncStorage.setItem('@privateai/onboarding_done', '1');
  } catch {}
}

type Props = { navigation: StackNavigationProp<RootStackParamList, 'Onboarding'> };

const getSlides = (colors: AppColorsType) => [
  {
    icon: '\uD83D\uDEE1\uFE0F',
    title: 'Private chat.\nNo account.',
    body: 'Private AI gives you a fast ChatGPT-style assistant with encrypted cloud inference and local chat history.',
    accent: colors.accentCyan,
  },
  {
    icon: '\uD83D\uDD12',
    title: 'Your data,\nyour rules.',
    body: null,
    features: [
      { icon: '+', text: 'No account or sign-in needed' },
      { icon: '+', text: 'Chat history is stored on this device' },
      { icon: '+', text: 'Replies run through confidential cloud inference' },
      { icon: '+', text: 'Web search can be turned on or off anytime' },
      { icon: '+', text: 'No analytics or ad tracking' },
    ],
    accent: colors.accentGreen,
  },
  {
    icon: '\uD83E\uDDE0',
    title: 'It remembers\nyou.',
    body: 'Private AI can remember durable details like your projects and preferences. The memory list is stored locally and can be cleared anytime.',
    accent: colors.accentOrange,
  },
];

export const OnboardingScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const slides = React.useMemo(() => getSlides(colors), [colors]);
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
                i === page && { backgroundColor: colors.accentCyan, width: 22 },
              ]}
            />
          ))}
        </View>

        <TouchableOpacity
          onPress={goNext}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={page < slides.length - 1 ? 'Next' : 'Get started'}
          style={[styles.cta, { backgroundColor: colors.accentCyan }]}
        >
          <Text style={styles.ctaText}>
            {page < slides.length - 1 ? 'Next →' : 'Get started →'}
          </Text>
        </TouchableOpacity>

        {page < slides.length - 1 && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
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

const createStyles = (colors: AppColorsType) => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.primaryDark,
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
    color: colors.textPrimary,
    marginBottom: 18,
    letterSpacing: 0.1,
  },
  body: {
    fontSize: 17,
    lineHeight: 26,
    color: colors.textSecondary,
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
    color: colors.textPrimary,
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
    backgroundColor: colors.borderStrong,
  },
  cta: {
    width: '100%',
    paddingVertical: 17,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: colors.accentCyan,
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
    color: colors.textMuted,
  },
});
