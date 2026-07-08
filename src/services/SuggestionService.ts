/**
 * SuggestionService — personalized empty-state suggestion chips.
 *
 * Turns the top memory facts into 3 tappable chat openers ("How's the
 * TestFlight launch going?") via one small backend call, cached for the
 * day in AsyncStorage. Falls back to null (caller shows static chips)
 * whenever there aren't enough facts or the call fails — this must never
 * block or break the empty state.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { chatComplete } from './BackendClient';
import * as Memory from './MemoryService';

const KEY = '@privateai/suggestions';
const MIN_FACTS = 2;

export interface SuggestionChip {
  icon: string;
  text: string;
}

interface SuggestionCache {
  date: string; // YYYY-MM-DD
  items: SuggestionChip[];
}

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const SUGGEST_SYSTEM =
  'Reasoning: low\n\n' +
  'You write chat-opener suggestions for a personal AI assistant app. ' +
  'Given facts about the user, write exactly 3 short suggestions THEY might tap to start a chat — ' +
  'personal, specific to the facts, useful or fun. Max 8 words each. ' +
  'Never mention "your memory" or the facts themselves meta-style; just be a good opener. ' +
  'Output exactly 3 lines, each formatted as: EMOJI | suggestion text\n' +
  'Example: 🚀 | How should I price my app?';

function parseChips(out: string): SuggestionChip[] {
  return out
    .split('\n')
    .map(l => l.trim())
    .map(l => l.match(/^(\S{1,8})\s*\|\s*(.{4,80})$/u))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map(m => ({ icon: m[1], text: m[2].trim().replace(/^["']|["']$/g, '') }))
    .slice(0, 3);
}

export async function getPersonalizedSuggestions(): Promise<SuggestionChip[] | null> {
  try {
    const facts = Memory.getFacts().slice(0, 8);
    if (facts.length < MIN_FACTS) return null;

    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const cached: SuggestionCache = JSON.parse(raw);
      if (cached.date === today() && cached.items?.length >= 2) return cached.items;
    }

    const factList = facts.map(f => `- ${f.text}`).join('\n');
    const result = await chatComplete(
      [
        { role: 'system', content: SUGGEST_SYSTEM },
        { role: 'user', content: `Facts about the user:\n${factList}` },
      ],
      { maxTokens: 220, temperature: 0.7, timeoutMs: 15_000 },
    );

    const items = parseChips(result.text || '');
    if (items.length < 2) return null;

    await AsyncStorage.setItem(KEY, JSON.stringify({ date: today(), items } satisfies SuggestionCache));
    return items;
  } catch {
    return null;
  }
}
