/**
 * NotificationService — local notifications only, never push/remote.
 * Currently used for the "remind me when my free messages reset" nudge;
 * `scheduleReminder` is generic so future memory-based nudges can reuse it
 * without another native dependency.
 *
 * Lazily required + defensive, consistent with this app's other native
 * service wrappers (PurchaseService, LiveActivityService).
 */
let Notifications: any = null;

function native(): any | null {
  if (Notifications) return Notifications;
  try {
    Notifications = require('expo-notifications');
    return Notifications;
  } catch {
    return null;
  }
}

/** Call once at app boot. Foreground display behavior only matters if the
 * app happens to be open when a scheduled notification fires. */
export function initNotifications(): void {
  const N = native();
  if (!N) return;
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function requestPermission(): Promise<boolean> {
  const N = native();
  if (!N) return false;
  try {
    const existing = await N.getPermissionsAsync();
    if (existing.granted) return true;
    const requested = await N.requestPermissionsAsync();
    return Boolean(requested.granted);
  } catch (e) {
    console.warn('[Notifications] permission request failed:', e);
    return false;
  }
}

const QUOTA_RESET_ID = 'quota-reset-reminder';

function nextLocalMidnight(): Date {
  const now = new Date();
  // A few minutes past midnight, not exactly on it — small safety margin
  // against clock/scheduling edge effects.
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 5, 0);
}

/** Schedule (replacing any existing one) the free-tier reset reminder for the next local midnight. */
export async function scheduleQuotaResetReminder(): Promise<boolean> {
  const N = native();
  if (!N) return false;
  const granted = await requestPermission();
  if (!granted) return false;
  try {
    await N.cancelScheduledNotificationAsync(QUOTA_RESET_ID).catch(() => {});
    await N.scheduleNotificationAsync({
      identifier: QUOTA_RESET_ID,
      content: {
        title: 'Private AI',
        body: 'Your free messages have reset — come back and pick up where you left off.',
      },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: nextLocalMidnight() },
    });
    return true;
  } catch (e) {
    console.warn('[Notifications] schedule quota reminder failed:', e);
    return false;
  }
}

export async function cancelQuotaResetReminder(): Promise<void> {
  const N = native();
  if (!N) return;
  await N.cancelScheduledNotificationAsync(QUOTA_RESET_ID).catch(() => {});
}

/** Generic one-off local reminder for future features (memory-based nudges, etc). */
export async function scheduleReminder(title: string, body: string, date: Date): Promise<string | null> {
  const N = native();
  if (!N) return null;
  const granted = await requestPermission();
  if (!granted) return null;
  try {
    return await N.scheduleNotificationAsync({
      content: { title, body },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date },
    });
  } catch (e) {
    console.warn('[Notifications] schedule reminder failed:', e);
    return null;
  }
}
