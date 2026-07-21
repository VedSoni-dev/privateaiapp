/**
 * ChatStorageService — persists chat sessions to AsyncStorage.
 *
 * Storage layout:
 *   '@privateai/sessions_index'      — list of all sessions (id, title, timestamps)
 *   '@privateai/session_{id}'        — full message array per session
 *
 * Nothing leaves the device.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatMessage } from '../components/ChatMessageBubble';

const INDEX_KEY = '@privateai/sessions_index';

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessagePreview?: string;
}

export interface ChatSessionFull extends ChatSession {
  messages: ChatMessage[];
}

function sessionKey(id: string): string {
  return `@privateai/session_${id}`;
}

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function readIndex(): Promise<ChatSession[]> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeIndex(sessions: ChatSession[]): Promise<void> {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(sessions));
}

/**
 * Load all session summaries, sorted newest first.
 */
export async function loadSessions(): Promise<ChatSession[]> {
  const sessions = await readIndex();
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Load a single session's full message history.
 */
export async function loadSession(id: string): Promise<ChatSessionFull | null> {
  try {
    const raw = await AsyncStorage.getItem(sessionKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Dates are serialized as strings — restore them.
    if (parsed.messages) {
      parsed.messages = parsed.messages.map((m: any) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      }));
    }
    return parsed as ChatSessionFull;
  } catch {
    return null;
  }
}

/**
 * Save (create or update) a session.
 */
export async function saveSession(session: ChatSessionFull): Promise<void> {
  await AsyncStorage.setItem(sessionKey(session.id), JSON.stringify(session));

  const index = await readIndex();
  const summary: ChatSession = {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: session.messages.length,
    lastMessagePreview: session.messages[session.messages.length - 1]?.text?.slice(0, 120) || '',
  };
  const idx = index.findIndex(s => s.id === session.id);
  if (idx >= 0) {
    index[idx] = summary;
  } else {
    index.unshift(summary);
  }
  await writeIndex(index);
}

/**
 * Delete a session and remove it from the index.
 */
export async function deleteSession(id: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(sessionKey(id));
  } catch { /* ignore */ }
  const index = await readIndex();
  await writeIndex(index.filter(s => s.id !== id));
}

/**
 * Rename a session's title (in both the index and its full record).
 */
export async function renameSession(id: string, title: string): Promise<void> {
  const trimmed = title.trim().slice(0, 80);
  if (!trimmed) return;

  const index = await readIndex();
  const idx = index.findIndex(s => s.id === id);
  if (idx >= 0) {
    index[idx] = { ...index[idx], title: trimmed };
    await writeIndex(index);
  }

  const full = await loadSession(id);
  if (full) {
    await AsyncStorage.setItem(sessionKey(id), JSON.stringify({ ...full, title: trimmed }));
  }
}

/**
 * Create a new blank session object (not yet persisted).
 */
export function createSession(): ChatSessionFull {
  const now = Date.now();
  return {
    id: genId(),
    title: 'New chat',
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    messages: [],
  };
}

/**
 * Derive an auto-title from the first user message.
 */
export function autoTitle(firstUserText: string): string {
  return firstUserText.trim().slice(0, 40) + (firstUserText.length > 40 ? '…' : '');
}
