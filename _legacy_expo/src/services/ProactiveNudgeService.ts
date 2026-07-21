/**
 * ProactiveNudgeService — a conservative, on-device check for "you mentioned
 * something time-sensitive" nudges (e.g. "you mentioned an exam Thursday").
 *
 * Deliberately NOT trying to compute exact dates from freeform text — that's
 * unreliable enough to feel broken. Instead: a fact only qualifies if it has
 * both a concern keyword (exam, deadline, meeting...) AND a temporal
 * reference (a weekday, "tomorrow", a month...), was learned recently, and
 * hasn't faded. The nudge itself is phrased as an offer to help, not a
 * confident "this is happening today" claim — so it stays useful even when
 * the exact timing is fuzzy. At most one nudge is shown per calendar day.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Memory from './MemoryService';

const LAST_SHOWN_KEY = '@privateai/last_nudge_shown_date';
const RECENT_WINDOW_DAYS = 10;

const CONCERN_RE =
  /\b(exam|deadline|due|meeting|interview|appointment|presentation|launch|flight|trip|birthday|demo|deploy|release|quiz|assignment|call|conference|wedding|reservation)\b/i;

const TEMPORAL_RE =
  /\b(today|tomorrow|tonight|this week|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b/i;

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export async function getProactiveNudge(): Promise<string | null> {
  try {
    const lastShown = await AsyncStorage.getItem(LAST_SHOWN_KEY);
    if (lastShown === today()) return null;

    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const candidate = Memory.getFacts().find(f => {
      const age = now - f.createdAt;
      return age < RECENT_WINDOW_DAYS * DAY && f.effective > 0.4
        && CONCERN_RE.test(f.text) && TEMPORAL_RE.test(f.text);
    });
    if (!candidate) return null;

    await AsyncStorage.setItem(LAST_SHOWN_KEY, today());
    return `You mentioned: "${candidate.text}" — want help getting ready for it?`;
  } catch {
    return null;
  }
}
