/**
 * LiveActivityService — Dynamic Island / Lock Screen Live Activity for
 * in-flight answers.
 *
 * When a question is asked, a Live Activity starts showing the question and
 * an elapsed timer; when the answer completes it flips to "Answer ready" with
 * a preview. iOS surfaces it in the Dynamic Island when the user backgrounds
 * the app mid-answer — the whole point of the feature.
 *
 * Expo Go-safe: expo-live-activity is lazily required and every call no-ops
 * when the native module is missing (Expo Go) or on iOS < 16.2 / Android.
 *
 * NOTE: expo-live-activity is deprecated upstream in favor of expo-widgets,
 * which needs Expo SDK 55+. Swap when the app upgrades SDKs (see CLAUDE.md).
 */
import { AppColors } from '../theme';

let LiveActivityModule: any = null;

function native(): any | null {
  if (LiveActivityModule) return LiveActivityModule;
  try {
    // Lazy require: module doesn't exist in Expo Go — never import top-level.
    LiveActivityModule = require('expo-live-activity');
    return LiveActivityModule;
  } catch {
    return null;
  }
}

// Crimson-and-cream, matching the app chrome.
const ACTIVITY_CONFIG = {
  backgroundColor: AppColors.primaryDark,
  titleColor: AppColors.textPrimary,
  subtitleColor: AppColors.textSecondary,
  progressViewTint: AppColors.accentCyan, // crimson (see theme naming gotcha)
  progressViewLabelColor: AppColors.textMuted,
  timerType: 'circular' as const,
  deepLinkUrl: 'privateai://',
  imagePosition: 'left' as const,
  imageAlign: 'center' as const,
  imageSize: { width: 22, height: 22 },
};

// assets/liveActivity/pai_dot.png — a small solid crimson dot. Without an
// image, the Dynamic Island's compact (pill) state has nothing to draw and
// looks completely empty even while the activity is genuinely running —
// this is what makes it visibly "active" at a glance.
const DOT_IMAGE = 'pai_dot';

let currentActivityId: string | null = null;

function truncate(s: string, n: number): string {
  const clean = (s || '').replace(/\s+/g, ' ').trim();
  return clean.length > n ? `${clean.slice(0, n - 1)}…` : clean;
}

/** Call when a question is sent. Replaces any previous activity. */
export function startAnswerActivity(question: string): void {
  const mod = native();
  if (!mod) return;
  try {
    if (currentActivityId) {
      // Only one answer in flight at a time; retire the stale one silently.
      mod.stopActivity(currentActivityId, {
        title: 'Private AI',
        subtitle: 'Superseded',
        progressBar: { progress: 1 },
      });
      currentActivityId = null;
    }
    currentActivityId = mod.startActivity(
      {
        title: 'Thinking…',
        subtitle: truncate(question, 80),
        progressBar: { elapsedTimer: { startDate: Date.now() } },
        imageName: DOT_IMAGE,
        dynamicIslandImageName: DOT_IMAGE,
      },
      ACTIVITY_CONFIG,
    ) ?? null;
  } catch (e) {
    console.warn('[LiveActivity] start failed:', e);
    currentActivityId = null;
  }
}

/** Call when the answer finished streaming. */
export function completeAnswerActivity(answerText: string): void {
  const mod = native();
  if (!mod || !currentActivityId) return;
  try {
    mod.stopActivity(currentActivityId, {
      title: 'Answer ready ✓',
      subtitle: truncate(answerText, 100),
      progressBar: { progress: 1 },
      imageName: DOT_IMAGE,
      dynamicIslandImageName: DOT_IMAGE,
    });
  } catch (e) {
    console.warn('[LiveActivity] complete failed:', e);
  }
  currentActivityId = null;
}

/** Call on error or user cancel. */
export function endAnswerActivity(reason: 'error' | 'cancelled'): void {
  const mod = native();
  if (!mod || !currentActivityId) return;
  try {
    mod.stopActivity(currentActivityId, {
      title: reason === 'error' ? 'Something went wrong' : 'Stopped',
      subtitle: reason === 'error' ? 'Tap to retry in the app' : '',
      progressBar: { progress: 1 },
      imageName: DOT_IMAGE,
      dynamicIslandImageName: DOT_IMAGE,
    });
  } catch {
    /* best-effort */
  }
  currentActivityId = null;
}
