/**
 * UsageService — tracks daily free-tier usage.
 * Resets at midnight local time. Persisted to AsyncStorage so it survives app restarts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@privateai/usage';

export const FREE_DAILY_LIMIT = 20;

interface UsageStore {
  date: string;       // 'YYYY-MM-DD'
  messages: number;
  isPro: boolean;
  proExpiresAt?: number; // timestamp, for future StoreKit validation
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

let store: UsageStore = { date: today(), messages: 0, isPro: false };
let loaded = false;

async function load(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return;
    const parsed: UsageStore = JSON.parse(raw);
    // Reset count if it's a new day
    store = parsed.date === today()
      ? parsed
      : { ...parsed, date: today(), messages: 0 };
  } catch {}
}

async function save(): Promise<void> {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(store)); } catch {}
}

export async function initUsage(): Promise<void> {
  await load();
}

export function getUsage(): { messages: number; limit: number; isPro: boolean; remaining: number } {
  return {
    messages: store.messages,
    limit: FREE_DAILY_LIMIT,
    isPro: store.isPro,
    remaining: Math.max(0, FREE_DAILY_LIMIT - store.messages),
  };
}

export function canSendMessage(): boolean {
  return store.isPro || store.messages < FREE_DAILY_LIMIT;
}

export async function recordMessage(): Promise<void> {
  await load();
  if (store.date !== today()) {
    store.date = today();
    store.messages = 0;
  }
  store.messages += 1;
  await save();
}

export async function activatePro(): Promise<void> {
  await load();
  store.isPro = true;
  await save();
}

export async function deactivatePro(): Promise<void> {
  await load();
  store.isPro = false;
  store.proExpiresAt = undefined;
  await save();
}

export function isPro(): boolean {
  return store.isPro;
}
