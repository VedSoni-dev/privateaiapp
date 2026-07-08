/**
 * WebSearchService — thin client.
 * All scraping/fetching runs in the Cloudflare Worker (worker/src/index.ts).
 * Device sends the query, receives <5KB JSON. No Jina buffers in device RAM.
 */

export interface SearchItem {
  title: string;
  url: string;
  snippet: string;
}

// Deployed Worker URL — update after `wrangler deploy`
const WORKER_URL = 'https://private-ai-search.vedantn06soni.workers.dev';
// Must match the Worker's SEARCH_TOKEN secret. Extractable from the binary,
// so it only deters drive-by abuse; the Worker ignores it until the secret
// is set (see worker/src/index.ts).
const SEARCH_TOKEN = 'pai-search-v2-8f3a1c6d';

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function webSearch(
  query: string,
): Promise<{ text: string; items: SearchItem[] } | null> {
  try {
    const res = await withTimeout(
      fetch(`${WORKER_URL}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-search-token': SEARCH_TOKEN },
        body: JSON.stringify({ query }),
      }),
      12_000,
    );
    if (!res || !res.ok) return null;
    const data: any = await res.json();
    if (!data?.text && !data?.items?.length) return null;
    // Keep enough context for sports/news pages where the useful facts can
    // appear after navigation text or multiple result cards.
    const text = String(data.text ?? '').slice(0, 6500);
    const items = (data.items ?? []).slice(0, 4);
    return { text, items };
  } catch (e) {
    console.warn('[WebSearch] Worker request failed:', e);
    return null;
  }
}

const RECENCY_PATTERNS = [
  /\b(latest|recent|recently|current|currently|today|tonight|now|nowadays|this (week|month|year)|yesterday|tomorrow|upcoming|just announced)\b/i,
  /\b(news|headline|breaking|weather|temperature|forecast|price|cost|stock|market|score|standings|schedule|fixtures|release date)\b/i,
  /\b(who (is|are|was|won|made|invented)|what is the (current|latest|new|price|score|date|population)|when (is|was|does|did) .{3,30} (happen|release|start|end|open|close|air)|where is .{3,20} (located|based|from)|how much (does|is|did) .{3,30} cost)\b/i,
  /\bworld cup\b|\belection\b|\bsuper bowl\b|\bolympics?\b|\bplayoffs?\b|\bchampionship\b|\bgame (score|result|today)\b/i,
  /\b(iphone|chatgpt|gemini|openai|apple|google|microsoft|meta|tesla)\b.{0,40}\b(price|release|version|update|announced|launched|available)\b/i,
  /\b20(2[5-9]|[3-9]\d)\b/,
];

const CONVERSATIONAL_PREFIXES = /^(yes|no|yeah|nah|yep|nope|ok|okay|sure|right|exactly|same|definitely|definately|actually|wait|but|oh|hmm|lol|haha|i know|i see|i think|i mean|theres|there is|there are|its|it is|that is|that's|sounds|makes sense|got it|understood|fair|true|agreed|correct|wrong|not quite|not really|well|so|and|also)\b/i;

function heuristicNeedsSearch(text: string): boolean {
  const words = text.trim().split(/\s+/).length;
  if (words <= 10 && !text.includes('?') && CONVERSATIONAL_PREFIXES.test(text.trim())) {
    return false;
  }
  return RECENCY_PATTERNS.some(re => re.test(text));
}

export async function planSearch(userText: string): Promise<string | null> {
  const q = (userText || '').trim();
  if (!q || q.length < 5) return null;
  if (!heuristicNeedsSearch(q)) return null;
  return q.slice(0, 200);
}

export function buildSearchBlock(query: string, resultsText: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return (
    `\n\n=== WEB SEARCH (${today}): "${query}" ===\n${resultsText}\n=== END ===\n` +
    `Answer ONLY from the search results above. If the answer is not in the snippets, ` +
    `say you searched but could not find a reliable answer. Do not guess or invent facts.`
  );
}

export function buildNoResultsBlock(query: string): string {
  return (
    `\n\nNOTE: A live web search for "${query}" returned no usable results just now ` +
    `(the device may be offline or the search was blocked). ` +
    `Tell the user plainly that you couldn't retrieve live information right now and ` +
    `that they could try again. Do NOT invent current facts such as scores, schedules, ` +
    `fixtures, news, prices, or standings.`
  );
}
