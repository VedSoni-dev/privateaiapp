/**
 * WebSearchService *
 * Agentic, opt-in web search for the on-device model. Ported from the desktop
 * app's orchestrated approach: the tiny local model can't call tools natively,
 * so we (1) decide whether a turn needs fresh info, (2) fetch results from
 * DuckDuckGo here in JS (no API key, no CORS in React Native), and (3) feed the
 * results back into the prompt. Inference always stays on-device — only the
 * search query itself leaves the phone, and only when the user opts in.
 */

// A desktop UA gets the plain HTML results page from DuckDuckGo instead of a
// mobile redirect / app-interstitial that breaks scraping on-device.
const SEARCH_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0';

export interface SearchItem {
  title: string;
  url: string;
  snippet: string;
}

function stripHtml(s = ''): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// DuckDuckGo wraps each result as //duckduckgo.com/l/?uddg=<encoded real url>.
function ddgRealUrl(href = ''): string {
  const m = href.match(/[?&]uddg=([^&]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return '';
    }
  }
  return href.startsWith('http') ? href : '';
}

function domainOf(url = ''): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function parseDdgHtml(html: string, max: number): SearchItem[] {
  const titles = [
    ...html.matchAll(
      /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g,
    ),
  ];
  const snippets = [
    ...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g),
  ].map(m => stripHtml(m[1]));

  const items: SearchItem[] = [];
  for (let i = 0; i < titles.length && items.length < max; i++) {
    const title = stripHtml(titles[i][2]);
    if (!title) continue;
    const url = ddgRealUrl(titles[i][1]);
    items.push({ title, url, snippet: snippets[i] || '' });
  }
  return items;
}

// The "lite" endpoint is simpler markup and a good fallback when the html
// endpoint returns a challenge page.
function parseDdgLite(html: string, max: number): SearchItem[] {
  const links = [
    ...html.matchAll(/<a[^>]+class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g),
  ];
  const snippets = [
    ...html.matchAll(/class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g),
  ].map(m => stripHtml(m[1]));
  const items: SearchItem[] = [];
  for (let i = 0; i < links.length && items.length < max; i++) {
    const title = stripHtml(links[i][2]);
    if (!title) continue;
    const url = ddgRealUrl(links[i][1]);
    items.push({ title, url, snippet: snippets[i] || '' });
  }
  return items;
}

// Last-resort parser: grab any external anchor on the page. DuckDuckGo markup
// changes often, so this keeps us working even when the class names move.
function parseAnchorsGeneric(html: string, max: number): SearchItem[] {
  const anchors = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const items: SearchItem[] = [];
  const seen = new Set<string>();
  for (const a of anchors) {
    if (items.length >= max) break;
    const url = ddgRealUrl(a[1]);
    if (!url) continue;
    const dom = domainOf(url);
    if (!dom || dom.includes('duckduckgo.com')) continue;
    const title = stripHtml(a[2]);
    if (!title || title.length < 4) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    items.push({ title, url, snippet: '' });
  }
  return items;
}

async function fetchText(
  url: string,
  init?: { method?: string; body?: string; contentType?: string },
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: init?.method ?? 'GET',
      headers: {
        'User-Agent': SEARCH_UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(init?.contentType ? { 'Content-Type': init.contentType } : {}),
      },
      body: init?.body,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ]);
}

// DuckDuckGo's Instant Answer API returns a structured (if shallow) summary
// with no scraping required — a reliable extra signal to ground the model.
async function fetchInstantAnswer(query: string): Promise<SearchItem | null> {
  try {
    const res = await withTimeout(
      fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(
          query,
        )}&format=json&no_html=1&skip_disambig=1&t=privateai`,
        { headers: { 'User-Agent': SEARCH_UA, Accept: 'application/json' } },
      ),
      10000,
    );
    if (!res || !res.ok) return null;
    const data: any = await res.json();
    const abstract: string = data.AbstractText || data.Answer || '';
    if (!abstract) return null;
    return {
      title: data.Heading || query,
      url: data.AbstractURL || '',
      snippet: String(abstract),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch the top web results for a query and format them for the model.
 * Returns null if nothing usable came back. Tries several endpoints/parsers so
 * a single markup change or block doesn't silently leave the model guessing.
 */
export async function webSearch(
  query: string,
  max = 4,
): Promise<{ text: string; items: SearchItem[] } | null> {
  const q = encodeURIComponent(query);
  let items: SearchItem[] = [];

  // 1) html endpoint via GET, then POST (DDG accepts a form post here).
  let html = await withTimeout(
    fetchText(`https://html.duckduckgo.com/html/?q=${q}`),
    15000,
  );
  if (html) items = parseDdgHtml(html, max);

  if (items.length === 0) {
    html = await withTimeout(
      fetchText('https://html.duckduckgo.com/html/', {
        method: 'POST',
        body: `q=${q}`,
        contentType: 'application/x-www-form-urlencoded',
      }),
      15000,
    );
    if (html) items = parseDdgHtml(html, max);
  }

  // 2) lite endpoint (simpler markup).
  if (items.length === 0) {
    html = await withTimeout(
      fetchText(`https://lite.duckduckgo.com/lite/?q=${q}`),
      15000,
    );
    if (html) {
      items = parseDdgLite(html, max);
      if (items.length === 0) items = parseAnchorsGeneric(html, max);
    }
  }

  // 3) Instant Answer as a structured top result / sole fallback.
  const instant = await fetchInstantAnswer(query);
  if (instant) items = [instant, ...items];

  // Drop empty/garbage and de-dupe by url.
  const seen = new Set<string>();
  items = items.filter(it => {
    if (!it.title) return false;
    const key = it.url || it.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (items.length === 0) return null;

  const text = items
    .slice(0, max)
    .map(
      (it, i) =>
        `[${i + 1}] ${it.title}${it.url ? ` (${domainOf(it.url)})` : ''}\n${
          it.snippet || '(no snippet)'
        }`,
    )
    .join('\n\n')
    .slice(0, 1800);

  return { text, items: items.slice(0, max) };
}

const RECENCY_PATTERNS = [
  // Time-anchored intent
  /\b(latest|recent|recently|current|currently|today|tonight|now|nowadays|this (week|month|year)|yesterday|tomorrow|upcoming|just|new|announced)\b/i,
  // Real-time data
  /\b(news|headline|breaking|weather|temperature|forecast|price|cost|stock|market|score|won|winner|winning|standings|schedule|fixtures|release date|launch|update|patch|version)\b/i,
  // Question structures that imply factual lookup
  /\b(who is|who are|who was|who won|who made|who invented|what is the|what are the|when is|when was|when does|when did|where is|where was|how much (is|does|did)|what year|how many|which (team|country|person|company))\b/i,
  // Sports / events / entertainment
  /\bworld cup\b|\belection\b|\bsuper bowl\b|\bolympics?\b|\bplayoffs?\b|\bchampionship\b|\bgame (score|result|today)\b|\bbox office\b|\balbum\b|\bfilm\b|\bmovie\b/i,
  // Technology / product lookups
  /\b(iphone|android|gpt|chatgpt|gemini|openai|apple|google|microsoft|meta|tesla|amazon)\b/i,
  // Year mention = likely wants current info
  /\b20[2-9]\d\b/,
  // Simple question detection: ends with ? or starts with question word
  /^(who|what|when|where|why|how|is|are|was|were|did|does|do|can|could|will|would|should|has|have)\b/i,
  /\?$/,
];

function heuristicNeedsSearch(text: string): boolean {
  return RECENCY_PATTERNS.some(re => re.test(text));
}

/**
 * Decide whether this turn needs a search and, if so, the query to run.
 * Heuristic-only — avoids a second native LLM call before streaming, which
 * was crashing the app on iOS (generate → generateStream back-to-back).
 */
export async function planSearch(userText: string): Promise<string | null> {
  const q = (userText || '').trim();
  if (!q || q.length < 5) return null;
  if (!heuristicNeedsSearch(q)) return null;
  return q.slice(0, 200);
}

/** Build the system-prompt block injected when search results are available. */
export function buildSearchBlock(query: string, resultsText: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return (
    `\n\n=== WEB SEARCH (${today}): "${query}" ===\n${resultsText}\n=== END ===\n` +
    `Answer ONLY from the search results above. If the answer is not in the snippets, ` +
    `say you searched but could not find a reliable answer. Do not guess or invent facts.`
  );
}

/**
 * Block injected when web search is on for a real-time question but no usable
 * results came back. Prevents the model from fabricating an answer.
 */
export function buildNoResultsBlock(query: string): string {
  return (
    `\n\nNOTE: A live web search for "${query}" returned no usable results just now ` +
    `(the device may be offline or the search was blocked). ` +
    `Tell the user plainly that you couldn't retrieve live information right now and ` +
    `that they could try again. Do NOT invent current facts such as scores, schedules, ` +
    `fixtures, news, prices, or standings.`
  );
}
