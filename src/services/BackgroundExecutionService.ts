/**
 * BackgroundExecutionService — keeps the JS runtime (and therefore the
 * in-flight answer stream) alive for a bit after the user backgrounds the
 * app, using iOS's standard `beginBackgroundTask` grace period.
 *
 * Without this, iOS suspends the app within seconds of backgrounding, which
 * kills the network stream mid-answer — the Dynamic Island then has nothing
 * to complete, and the user sees a confusing network error.
 *
 * This is iOS's default, App-Review-safe execution grace (no special
 * Info.plist background mode declared, unlike audio/location background
 * modes which risk rejection if used for something they're not intended
 * for). The OS still decides the exact budget and can reclaim it at any
 * time — this buys extra seconds, it does not guarantee completion of
 * arbitrarily long answers.
 *
 * Expo Go-safe: lazily required, no-ops everywhere the native module is
 * missing (Expo Go) or on Android (only wired for iOS here).
 */
import { Platform } from 'react-native';

let BackgroundService: any = null;

function native(): any | null {
  if (Platform.OS !== 'ios') return null;
  if (BackgroundService) return BackgroundService;
  try {
    // Lazy require: native module doesn't exist in Expo Go.
    BackgroundService = require('react-native-background-actions').default;
    return BackgroundService;
  } catch {
    return null;
  }
}

// Runs forever until stopped from outside — we only use this to hold the
// background-execution assertion open, not as the actual work being done.
async function idleUntilStopped(): Promise<void> {
  while (BackgroundService?.isRunning?.()) {
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

let active = false;
let expired = false;

/** Call right when a message is sent, before the stream starts. */
export async function beginBackgroundGrace(): Promise<void> {
  const svc = native();
  if (!svc) return;
  expired = false;
  try {
    svc.on('expiration', () => {
      // iOS is about to reclaim the time; the network stream will likely
      // die shortly after. Flag it so the error path can show an accurate
      // "you left too long" message instead of a generic failure.
      expired = true;
    });
    await svc.start(idleUntilStopped, {
      taskName: 'PrivateAI-Answer',
      taskTitle: 'Private AI',
      taskDesc: 'Finishing your answer…',
      taskIcon: { name: 'ic_launcher', type: 'mipmap' },
      color: '#8f1d31',
      linkingURI: 'privateai://',
    });
    active = true;
  } catch (e) {
    console.warn('[BackgroundExecution] begin failed:', e);
  }
}

/** Call once the stream settles (success, error, or cancel) — always. */
export async function endBackgroundGrace(): Promise<void> {
  const svc = native();
  if (!svc || !active) return;
  active = false;
  try {
    await svc.stop();
  } catch (e) {
    console.warn('[BackgroundExecution] end failed:', e);
  }
}

/** True if the OS reclaimed the background grace during the last turn. */
export function didExpireDuringLastTurn(): boolean {
  return expired;
}
