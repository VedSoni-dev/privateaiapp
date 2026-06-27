/**
 * ChatStorageService — persists chat sessions to the device's local filesystem.
 *
 * Storage layout:
 *   {DocumentDirectoryPath}/sessions/index.json      — list of all sessions (id, title, timestamps)
 *   {DocumentDirectoryPath}/sessions/session_{id}.json — full message array per session
 *
 * Nothing leaves the device. This is all RNFS (already a native dep, no rebuild).
 */
import RNFS from 'react-native-fs';
import type { ChatMessage } from '../components/ChatMessageBubble';

const SESSIONS_DIR = `${RNFS.DocumentDirectoryPath}/sessions`;
const INDEX_FILE = `${SESSIONS_DIR}/index.json`;

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface ChatSessionFull extends ChatSession {
  messages: ChatMessage[];
}

function sessionPath(id: string): string {
  return `${SESSIONS_DIR}/session_${id}.json`;
}

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function ensureDir(): Promise<void> {
  const exists = await RNFS.exists(SESSIONS_DIR);
  if (!exists) await RNFS.mkdir(SESSIONS_DIR);
}

async function readIndex(): Promise<ChatSession[]> {
  try {
    if (!(await RNFS.exists(INDEX_FILE))) return [];
    const raw = await RNFS.readFile(INDEX_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeIndex(sessions: ChatSession[]): Promise<void> {
  await RNFS.writeFile(INDEX_FILE, JSON.stringify(sessions), 'utf8');
}

/**
 * Load all session summaries, sorted newest first.
 */
export async function loadSessions(): Promise<ChatSession[]> {
  await ensureDir();
  const sessions = await readIndex();
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Load a single session's full message history.
 */
export async function loadSession(id: string): Promise<ChatSessionFull | null> {
  try {
    const path = sessionPath(id);
    if (!(await RNFS.exists(path))) return null;
    const raw = await RNFS.readFile(path, 'utf8');
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
  await ensureDir();
  await RNFS.writeFile(sessionPath(session.id), JSON.stringify(session), 'utf8');

  const index = await readIndex();
  const summary: ChatSession = {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: session.messages.length,
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
    const path = sessionPath(id);
    if (await RNFS.exists(path)) await RNFS.unlink(path);
  } catch { /* ignore */ }
  const index = await readIndex();
  await writeIndex(index.filter(s => s.id !== id));
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
