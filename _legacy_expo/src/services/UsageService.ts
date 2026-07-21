/**
 * UsageService - tracks daily free-tier usage.
 *
 * The phone keeps a local cache for instant UI, but the server is the source
 * of truth so the app can scale beyond a single device and survive reinstalls.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDeviceId } from './DeviceId';

const KEY = '@privateai/usage';
const BACKEND_URL = 'https://private-ai-backend.onrender.com';

export const FREE_DAILY_LIMIT = 20;

interface UsageStore {
  date: string; // 'YYYY-MM-DD'
  messages: number;
  isPro: boolean;
  proExpiresAt?: number; // timestamp, for future StoreKit validation
  serverSyncedAt?: number;
}

export interface UsageSnapshot {
  date: string;
  messages: number;
  isPro: boolean;
}

function today(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
    store = parsed.date === today()
      ? parsed
      : { ...parsed, date: today(), messages: 0 };
  } catch {}
}

async function save(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(store));
  } catch {}
}

function resetIfNewDay(): void {
  const current = today();
  if (store.date !== current) {
    store = { ...store, date: current, messages: 0 };
    if (loaded) void save();
  }
}

function applySnapshot(snapshot: Partial<UsageSnapshot> | null | undefined): void {
  if (!snapshot) return;
  const nextDate = typeof snapshot.date === 'string' && snapshot.date ? snapshot.date : today();
  const nextMessages = Number.isFinite(snapshot.messages) ? Math.max(0, Math.floor(snapshot.messages ?? 0)) : store.messages;
  store = {
    ...store,
    date: nextDate,
    messages: nextDate === today() ? nextMessages : 0,
    isPro: typeof snapshot.isPro === 'boolean' ? snapshot.isPro : store.isPro,
    serverSyncedAt: Date.now(),
  };
}

async function backendJson(path: string, init: RequestInit = {}): Promise<any> {
  const deviceId = await getDeviceId();
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-device-id': deviceId,
      'x-client-date': today(),
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `usage backend failed: ${res.status}`);
  }
  return data;
}

async function syncFromServer(): Promise<void> {
  try {
    const data = await backendJson(`/v1/usage?date=${encodeURIComponent(today())}`);
    applySnapshot(data?.usage);
    await save();
  } catch {}
}

async function pushMutation(path: string, body: Record<string, unknown>): Promise<void> {
  try {
    const data = await backendJson(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    applySnapshot(data?.usage);
    await save();
  } catch {}
}

export async function initUsage(): Promise<void> {
  await load();
  resetIfNewDay();
  await syncFromServer();
}

export async function refreshUsage(): Promise<void> {
  await load();
  resetIfNewDay();
  await syncFromServer();
}

export function getUsage(): { messages: number; limit: number; isPro: boolean; remaining: number } {
  resetIfNewDay();
  return {
    messages: store.messages,
    limit: FREE_DAILY_LIMIT,
    isPro: store.isPro,
    remaining: Math.max(0, FREE_DAILY_LIMIT - store.messages),
  };
}

export function canSendMessage(): boolean {
  resetIfNewDay();
  return store.isPro || store.messages < FREE_DAILY_LIMIT;
}

/**
 * Optimistic local bump for instant UI. The server counts the message itself
 * when /v1/chat is called (streaming requests only), so the POST below is a
 * read-only sync that reconciles our local number with the server's — it does
 * NOT increment anything server-side.
 */
export async function recordMessage(): Promise<void> {
  await load();
  resetIfNewDay();
  store.messages += 1;
  await save();
  void pushMutation('/v1/usage/record', { date: store.date });
}

export async function activatePro(): Promise<void> {
  await load();
  store.isPro = true;
  await save();
  void pushMutation('/v1/usage/pro', { isPro: true });
}

export async function deactivatePro(): Promise<void> {
  await load();
  store.isPro = false;
  store.proExpiresAt = undefined;
  await save();
  void pushMutation('/v1/usage/pro', { isPro: false });
}

export function isPro(): boolean {
  return store.isPro;
}
