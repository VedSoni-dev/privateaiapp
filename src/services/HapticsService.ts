import * as Haptics from 'expo-haptics';

export async function notificationSuccess(): Promise<void> {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // expo-haptics requires a native rebuild; no-op in older dev clients
  }
}

export async function impactLight(): Promise<void> {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // no-op
  }
}

export async function selection(): Promise<void> {
  try {
    await Haptics.selectionAsync();
  } catch {
    // no-op
  }
}
