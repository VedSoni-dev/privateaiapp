/**
 * DeviceId — a random, persistent per-install identifier.
 * Used only for backend rate limiting; carries no personal information.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@privateai/device_id';

let cached: string | null = null;

function randomId(): string {
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  try {
    const existing = await AsyncStorage.getItem(KEY);
    if (existing) {
      cached = existing.trim();
      if (cached) return cached;
    }
  } catch {}
  cached = randomId();
  try { await AsyncStorage.setItem(KEY, cached); } catch {}
  return cached;
}
