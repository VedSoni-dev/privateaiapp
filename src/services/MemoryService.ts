/**
 * MemoryService — the local, private long-term "brain".
 *
 * Ported from the desktop app's memory.cjs and adapted for React Native:
 *  - Learns durable facts about the user after each exchange
 *  - Injects what it knows into future chats (relevance + forgetting curve)
 *  - "Dreams": consolidates & prunes memories when enough has been learned
 *  - Auto-compacts long conversations so nothing important gets dropped
 *
 * All of it runs through the same on-device model. Nothing leaves the device.
 * Persistence uses react-native-fs (already a native dependency, no rebuild).
 */
import RNFS from 'react-native-fs';
import { chatComplete } from './BackendClient';

const FILE = `${RNFS.DocumentDirectoryPath}/private-ai-memory.json`;

const MAX_FACTS = 80;

// Forgetting curve — memories decay over time, strengthen when used.
const DAY = 24 * 60 * 60 * 1000;
const HALF_LIFE = 30 * DAY;
const FORGET_BELOW = 0.3;
const GRACE = 5 * DAY;
const INJECT_TOP = 14;
const REINFORCE = 0.5;

const STOPWORDS = new Set(
  (
    'the a an and or but is are was were be been being to of in on for with at by ' +
    'from as it its this that these those i you he she they we me my your their our ' +
    'have has had do does did will would can could should about into out up down'
  ).split(' '),
);

export interface MemoryFact {
  id: string;
  text: string;
  strength: number;
  createdAt: number;
  lastSeen: number;
}

interface MemoryStore {
  facts: MemoryFact[];
  lastDreamAt: number;
  extractsSinceDream: number;
}

let store: MemoryStore = { facts: [], lastDreamAt: 0, extractsSinceDream: 0 };
let loaded = false;
let persistQueue: Promise<void> = Promise.resolve();

/* ── helpers ── */
function effective(f: MemoryFact, now = Date.now()): number {
  const age = now - (f.lastSeen || f.createdAt || now);
  return (f.strength || 1) * Math.pow(0.5, age / HALF_LIFE);
}

function words(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(Boolean),
  );
}

function relevance(f: MemoryFact, ctxWords: Set<string>): number {
  if (!ctxWords || ctxWords.size === 0) return 0;
  let shared = 0;
  for (const w of words(f.text)) if (!STOPWORDS.has(w) && ctxWords.has(w)) shared++;
  return shared;
}

function similar(a: string, b: string): boolean {
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return false;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  const jacc = inter / (wa.size + wb.size - inter);
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  return jacc > 0.55 || al.includes(bl) || bl.includes(al);
}

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function parseBullets(text: string): string[] {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(l => /^[-*•]/.test(l))
    .map(l => l.replace(/^[-*•]\s*/, '').trim())
    .filter(l => l && l.toUpperCase() !== 'NONE' && l.length < 240);
}

/* ── A small non-streaming call to the backend model ── */
// "Reasoning: low" keeps gpt-oss's hidden reasoning short so these small,
// frequent background calls don't burn their whole token budget on
// reasoning and come back with an empty answer (content: null).
async function ask(
  system: string,
  user: string,
  { temperature = 0.1, maxTokens = 400 } = {},
): Promise<string> {
  try {
    const result = await chatComplete(
      [
        { role: 'system', content: `Reasoning: low\n\n${system}` },
        { role: 'user', content: user },
      ],
      { temperature, maxTokens },
    );
    return (result.text || '').trim();
  } catch {
    return '';
  }
}

/* ── persistence ── */
async function persist(): Promise<void> {
  // Serialize writes so concurrent learns don't clobber the file.
  persistQueue = persistQueue.then(async () => {
    try {
      await RNFS.writeFile(FILE, JSON.stringify(store), 'utf8');
    } catch {
      /* ignore */
    }
  });
  return persistQueue;
}

export async function init(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    if (await RNFS.exists(FILE)) {
      const raw = await RNFS.readFile(FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.facts)) store = parsed;
    }
  } catch {
    /* start fresh on corruption */
  }
  const now = Date.now();
  for (const f of store.facts) {
    if (f.strength == null) f.strength = 1;
    if (!f.createdAt) f.createdAt = now;
    if (!f.lastSeen) f.lastSeen = f.createdAt;
  }
  if (typeof store.extractsSinceDream !== 'number') store.extractsSinceDream = 0;
  forgetWeak();
}

/* ── public reads ── */
export function getFacts(): Array<MemoryFact & { effective: number; fading: boolean }> {
  const now = Date.now();
  return store.facts
    .map(f => {
      const eff = effective(f, now);
      return { ...f, effective: eff, fading: eff < 0.55 };
    })
    .sort((x, y) => y.effective - x.effective);
}

export function count(): number {
  return store.facts.length;
}

/** Return the top relevant facts for a context string — used by the agentic tool layer. */
export function getRelevantFacts(contextText = ''): Array<MemoryFact> {
  if (store.facts.length === 0) return [];
  const now = Date.now();
  const ctxWords = words(contextText || '');
  const scored = store.facts.map(f => ({
    f,
    score: effective(f, now) + relevance(f, ctxWords) * 1.5,
  }));
  scored.sort((a, b) => b.score - a.score);
  const chosen = scored.slice(0, INJECT_TOP).map(s => s.f);
  for (const f of chosen) {
    f.lastSeen = now;
    f.strength = Math.min((f.strength || 1) + REINFORCE, 25);
  }
  if (chosen.length) void persist();
  return chosen;
}

/**
 * The block silently prepended to a chat's system prompt. Picks the memories
 * most relevant to what's being discussed and reinforces them (using a memory
 * keeps it alive — the heart of the forgetting curve).
 */
export function buildMemoryBlock(contextText = ''): string {
  if (store.facts.length === 0) return '';
  const now = Date.now();
  const ctxWords = words(contextText || '');

  const scored = store.facts.map(f => ({
    f,
    score: effective(f, now) + relevance(f, ctxWords) * 1.5,
  }));
  scored.sort((a, b) => b.score - a.score);
  const chosen = scored.slice(0, INJECT_TOP).map(s => s.f);

  for (const f of chosen) {
    f.lastSeen = now;
    f.strength = Math.min((f.strength || 1) + REINFORCE, 25);
  }
  if (chosen.length) void persist();

  const lines = chosen.map(f => `- ${f.text}`).join('\n');
  return (
    `\n\nWhat you remember about this user (from past conversations — ` +
    `use it naturally, don't recite it back unless asked):\n${lines}`
  );
}

/* ── forgetting ── */
function forgetWeak(): string[] {
  const now = Date.now();
  const before = store.facts.length;
  const forgotten: string[] = [];
  store.facts = store.facts.filter(f => {
    const young = now - (f.createdAt || now) < GRACE;
    if (young) return true;
    if (effective(f, now) >= FORGET_BELOW) return true;
    forgotten.push(f.text);
    return false;
  });
  if (store.facts.length !== before) void persist();
  return forgotten;
}

/* ── writes ── */
function addFacts(texts: string[]): MemoryFact[] {
  const added: MemoryFact[] = [];
  for (const text of texts) {
    const hit = store.facts.find(f => similar(f.text, text));
    if (hit) {
      hit.strength = (hit.strength || 1) + 1;
      hit.lastSeen = Date.now();
      if (text.length > hit.text.length + 8) hit.text = text;
    } else {
      const fact: MemoryFact = {
        id: genId(),
        text,
        strength: 1,
        createdAt: Date.now(),
        lastSeen: Date.now(),
      };
      store.facts.push(fact);
      added.push(fact);
    }
  }
  if (store.facts.length > MAX_FACTS) {
    const now = Date.now();
    store.facts.sort((x, y) => effective(y, now) - effective(x, now));
    store.facts = store.facts.slice(0, MAX_FACTS);
  }
  void persist();
  return added;
}

export async function deleteFact(id: string): Promise<void> {
  store.facts = store.facts.filter(f => f.id !== id);
  await persist();
}

export async function clearAll(): Promise<void> {
  store.facts = [];
  store.extractsSinceDream = 0;
  await persist();
}

/* ── learning ── */
const EXTRACT_SYSTEM =
  'You are the memory of a personal AI assistant. Read one exchange between a USER and the assistant. ' +
  'Extract only NEW, durable facts worth remembering about the USER long-term: their name, where they live, ' +
  'their job/projects, preferences, goals, relationships, pets, important dates, or how they like to be helped. ' +
  "Write each as a short third-person statement (e.g. 'Is a solo founder building an app called Fern'). " +
  'Ignore small talk, one-off questions, and anything trivial. ' +
  "Output each fact on its own line starting with '- '. If there is nothing worth saving, output exactly: NONE";

export async function learnFromExchange(
  userText: string,
  assistantText: string,
): Promise<MemoryFact[]> {
  if (!userText || userText.length < 4) return [];
  const convo = `USER: ${userText}\n\nASSISTANT: ${assistantText}`.slice(0, 6000);
  const out = await ask(EXTRACT_SYSTEM, convo, { temperature: 0, maxTokens: 400 });
  store.extractsSinceDream++;
  if (!out || /^none$/i.test(out.trim())) {
    await persist();
    return [];
  }
  const facts = parseBullets(out);
  const added = addFacts(facts);
  await persist();
  return added;
}

/* ── dreaming: consolidate & prune ── */
const DREAM_SYSTEM =
  "You are the memory consolidation system of a personal AI ('dreaming'). " +
  'You are given a list of remembered facts about a user. Some may be duplicates, outdated, contradictory, or trivial. ' +
  'Rewrite the list into a clean, deduplicated set of the most important, current facts. ' +
  'Merge related facts. Drop redundancy and trivia. Keep the user\'s voice and specifics. ' +
  "Output one fact per line starting with '- ', at most 40 lines. If a later fact contradicts an earlier one, keep the later.";

export async function dream(): Promise<{ changed: boolean; before: number; after: number }> {
  if (store.facts.length < 6) {
    return { changed: false, before: store.facts.length, after: store.facts.length };
  }
  const before = store.facts.length;
  const list = getFacts()
    .map(f => `- ${f.text}`)
    .join('\n');
  const out = await ask(DREAM_SYSTEM, list, { temperature: 0.2, maxTokens: 900 });
  const cleaned = parseBullets(out);
  if (cleaned.length === 0) return { changed: false, before, after: before };

  const old = store.facts;
  const now = Date.now();
  store.facts = cleaned.slice(0, 40).map(text => {
    const match = old.find(f => similar(f.text, text));
    return {
      id: match?.id || genId(),
      text,
      strength: (match?.strength || 1) + 1,
      createdAt: match?.createdAt || now,
      lastSeen: match?.lastSeen || now,
    };
  });
  forgetWeak();
  store.lastDreamAt = now;
  store.extractsSinceDream = 0;
  await persist();
  return { changed: before !== store.facts.length, before, after: store.facts.length };
}

export function shouldDream(): boolean {
  return store.extractsSinceDream >= 8 && store.facts.length >= 8;
}

/* ── auto-compaction for long chats ── */
export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const COMPACT_CHAR_LIMIT = 14000;
const KEEP_RECENT = 6;
const COMPACT_SYSTEM =
  'Summarize the earlier part of this conversation into a tight recap that preserves ' +
  'names, decisions, facts, numbers and anything the assistant must remember to stay consistent. ' +
  'Write 4-8 short bullet points. No preamble.';

export async function compact(
  messages: ChatTurn[],
): Promise<{ messages: ChatTurn[]; compacted: boolean }> {
  const total = messages.reduce((n, m) => n + (m.content?.length || 0), 0);
  if (total < COMPACT_CHAR_LIMIT || messages.length <= KEEP_RECENT + 3) {
    return { messages, compacted: false };
  }
  const sys = messages[0]?.role === 'system' ? messages[0] : null;
  const body = sys ? messages.slice(1) : messages;
  const middle = body.slice(0, body.length - KEEP_RECENT);
  const recent = body.slice(body.length - KEEP_RECENT);
  if (middle.length === 0) return { messages, compacted: false };

  const transcript = middle
    .map(m => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.content || ''}`)
    .join('\n')
    .slice(0, 12000);
  const summary = await ask(COMPACT_SYSTEM, transcript, { temperature: 0.2, maxTokens: 700 });
  if (!summary) return { messages, compacted: false };

  const recap: ChatTurn = {
    role: 'system',
    content: `Recap of earlier conversation:\n${summary}`,
  };
  const out = sys ? [sys, recap, ...recent] : [recap, ...recent];
  return { messages: out, compacted: true };
}
