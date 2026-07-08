/**
 * Private AI — Search Worker
 * Cloudflare Worker that handles all web search on behalf of the app.
 * Device sends { query } → Worker fetches Brave/DDG + Jina → returns <5KB JSON.
 * LLM model memory never competes with page-fetch buffers.
 */

export interface Env {
  BRAVE_KEY?: string;
  /**
   * Shared secret required in the x-search-token header. Unset = auth off
   * (needed while app builds without the header are still in the wild).
   * Set via `wrangler secret put SEARCH_TOKEN` once those builds age out.
   * An embedded app token is extractable, so this is a speed bump against
   * drive-by abuse of the Brave quota, not real auth.
   */
  SEARCH_TOKEN?: string;
}

// Render's free tier spins the backend down after ~15 min idle, which turns
// a user's first message after a gap into a 20-30s (or failed) cold start.
// A cron trigger (see wrangler.jsonc) pings its /health endpoint often enough
// to keep it warm.
const BACKEND_HEALTH_URL = 'https://private-ai-backend.onrender.com/health';

interface SearchItem {
  title: string;
  url: string;
  snippet: string;
}

interface SearchResult {
  text: string;
  items: SearchItem[];
}

const SKIP_DOMAINS = [
  'youtube.com', 'twitter.com', 'x.com', 'instagram.com',
  'tiktok.com', 'facebook.com', 'linkedin.com',
  'duckduckgo.com', 'bing.com',
];

const PAGE_CONTENT_CAP = 2600;
const PAGES_TO_READ = 4;
const JINA_BUDGET_MS = 5000;
const RESULT_TEXT_CAP = 6500;
const SEARCH_CACHE_PREFIX = 'https://private-ai-search-cache.local/search';

function domainOf(url = ''): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

function shouldSkip(url: string): boolean {
  const host = domainOf(url);
  return SKIP_DOMAINS.some(d => host.includes(d));
}

function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function cacheTtlSeconds(query: string): number {
  if (/\b(weather|forecast|temperature|score|scores|today|tonight|now|current)\b/i.test(query)) {
    return 60;
  }
  if (/\b(news|latest|recent|price|stock)\b/i.test(query)) {
    return 180;
  }
  return 900;
}

function decodeHtmlEntities(s = ''): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function isAdOrTrackerUrl(url = ''): boolean {
  if (!url) return true;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'duckduckgo.com' && /^\/y\.js$/i.test(u.pathname)) return true;
    if (host.endsWith('bing.com') && /\/aclick/i.test(u.pathname)) return true;
    if (u.searchParams.has('ad_domain') || u.searchParams.has('ad_provider') || u.searchParams.has('ad_type')) return true;
    return false;
  } catch {
    return true;
  }
}

async function braveSearch(query: string, apiKey: string, count = 5): Promise<SearchItem[]> {
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}&search_lang=en&result_filter=web`,
      {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
      },
    );
    if (!res.ok) return [];
    const data: any = await res.json();
    return (data.web?.results ?? []).map((r: any) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.extra_snippets?.[0] || r.description || r.snippet || '',
    }));
  } catch {
    return [];
  }
}

function stripHtml(s = ''): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function ddgRealUrl(href = ''): string {
  href = decodeHtmlEntities(href);
  const m = href.match(/[?&]uddg=([^&]+)/);
  const url = m ? (() => { try { return decodeURIComponent(m[1]); } catch { return ''; } })() : href;
  if (!url.startsWith('http') || isAdOrTrackerUrl(url)) return '';
  return url;
}

const HTML_CAP = 60_000;

function parseDdgHtml(rawHtml: string, max: number): SearchItem[] {
  const html = rawHtml.slice(0, HTML_CAP);
  const titles = [...html.matchAll(/class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]{1,200})<\/a>/g)];
  const snippets = [...html.matchAll(/class="result__snippet"[^>]*>([^<]{0,400})<\/a>/g)]
    .map(m => stripHtml(m[1]));
  const items: SearchItem[] = [];
  for (let i = 0; i < titles.length && items.length < max; i++) {
    const title = stripHtml(titles[i][2]);
    const url = ddgRealUrl(titles[i][1]);
    if (!title || !url) continue;
    items.push({ title, url, snippet: snippets[i] || '' });
  }
  return items;
}

async function ddgSearch(query: string, max: number): Promise<SearchItem[]> {
  try {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PrivateAI/1.0)' } },
    );
    if (!res.ok) return [];
    const html = await res.text();
    const items = parseDdgHtml(html, max);
    if (items.length > 0) return items;
    // lite fallback
    const liteRes = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`);
    if (!liteRes.ok) return [];
    const liteHtml = await liteRes.text();
    const liteItems = [...liteHtml.slice(0, HTML_CAP).matchAll(/<a[^>]+class="result-link"[^>]*href="([^"]+)"[^>]*>([^<]{1,200})<\/a>/g)];
    return liteItems.slice(0, max).map(m => ({
      title: stripHtml(m[2]),
      url: ddgRealUrl(m[1]),
      snippet: '',
    })).filter(it => it.title && it.url);
  } catch {
    return [];
  }
}

function cleanReaderText(text: string): string {
  return text
    .replace(/^(Title:|URL Source:|URL:|Published Time:)[^\n]*\n/gm, '')
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/\[(Summary|Report|Full Scoreboard|Skip to main content|Skip to navigation|Home|Schedule|Standings|Stats|More Sports)[^\]]*]\([^)]+\)/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

async function fetchJinaPage(url: string): Promise<string | null> {
  if (!url || !url.startsWith('http') || shouldSkip(url)) return null;
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: 'text/plain', 'User-Agent': 'Mozilla/5.0 (compatible; PrivateAI/1.0)' },
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length < 100) return null;
    return cleanReaderText(text).slice(0, PAGE_CONTENT_CAP);
  } catch {
    return null;
  }
}

function rankItems(query: string, rawItems: SearchItem[]): SearchItem[] {
  const seen = new Set<string>();
  const q = query.toLowerCase();
  const sportsQuery = /\b(world cup|score|scores|game|games|fixture|fixtures|schedule|standings|match|matches|soccer|football)\b/i.test(query);

  return rawItems
    .map(it => ({
      ...it,
      title: stripHtml(decodeHtmlEntities(it.title)),
      url: ddgRealUrl(it.url) || it.url,
      snippet: stripHtml(decodeHtmlEntities(it.snippet)),
    }))
    .filter(it => it.title && it.url && !shouldSkip(it.url) && !isAdOrTrackerUrl(it.url))
    .filter(it => {
      const key = it.url.replace(/[#?].*$/, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(it => {
      const host = domainOf(it.url);
      let score = 0;
      if (sportsQuery) {
        if (/espn\.com|fifa\.com|mlssoccer\.com|foxsports\.com|cbssports\.com|bbc\.com|skysports\.com/.test(host)) score += 40;
        if (/worldcupmatchday\.com/.test(host)) score += 25;
        if (/\b(score|scores|scoreboard|fixtures?|schedule|matches?|today)\b/i.test(it.title)) score += 15;
      }
      if (q.includes('today') && /\b(today|scoreboard|scores|schedule)\b/i.test(it.title + ' ' + it.url)) score += 10;
      if (/\bfree trial|watch online|tickets|shop|odds|betting\b/i.test(it.title + ' ' + it.snippet)) score -= 30;
      return { item: it, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(r => r.item);
}

function fallbackItemsForQuery(query: string): SearchItem[] {
  if (/\b(world cup|fifa world cup|soccer world cup)\b/i.test(query)) {
    return [
      {
        title: 'FIFA World Cup Scores - 2026 Season - ESPN',
        url: 'https://www.espn.com/soccer/scoreboard/_/league/fifa.world',
        snippet: 'Live and recent FIFA World Cup scores and fixtures.',
      },
      {
        title: 'World Cup Matches Today - Scores, Fixtures & Kickoff Times',
        url: 'https://www.worldcupmatchday.com/today',
        snippet: 'Today\'s World Cup fixtures, kickoff times, match status, and scores.',
      },
      {
        title: 'FIFA World Cup 26 - Matches',
        url: 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/matches',
        snippet: 'Official FIFA match schedule and results.',
      },
    ];
  }
  if (/\b(openai|chatgpt|gpt)\b/i.test(query) && /\b(latest|today|news|recent|announced|released)\b/i.test(query)) {
    return [
      {
        title: 'OpenAI News',
        url: 'https://openai.com/news/',
        snippet: 'Official OpenAI product, research, safety, and company updates.',
      },
      {
        title: 'OpenAI News - Reuters',
        url: 'https://www.reuters.com/technology/openai/',
        snippet: 'Reuters coverage of OpenAI and AI industry news.',
      },
    ];
  }
  return [];
}

function extractWeatherLocation(query: string): string | null {
  const match = query.match(/\b(?:weather|forecast|temperature)\b(?:\s+(?:in|for|at))?\s+(.+?)(?:\s+(?:today|tomorrow|tonight|now|this week))?$/i);
  if (!match?.[1]) return null;
  const location = match[1]
    .replace(/[?.!,]+$/g, '')
    .replace(/\b(weather|forecast|temperature)\b/gi, '')
    .trim();
  return location.length >= 2 ? location.slice(0, 80) : null;
}

async function handleWeather(query: string): Promise<SearchResult | null> {
  const location = extractWeatherLocation(query);
  if (!location) return null;
  try {
    const res = await fetch(`https://wttr.in/${encodeURIComponent(location)}?format=j1`, {
      headers: { Accept: 'application/json', 'User-Agent': 'PrivateAI/1.0' },
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const current = data?.current_condition?.[0];
    const area = data?.nearest_area?.[0];
    if (!current) return null;
    const place = [
      area?.areaName?.[0]?.value,
      area?.region?.[0]?.value,
      area?.country?.[0]?.value,
    ].filter(Boolean).join(', ') || location;
    const desc = current.weatherDesc?.[0]?.value || 'current conditions';
    const humidity = current.humidity ? `, humidity ${current.humidity}%` : '';
    const wind = current.windspeedMiles ? `, wind ${current.windspeedMiles} mph` : '';
    const feels = current.FeelsLikeF ? `, feels like ${current.FeelsLikeF}°F` : '';
    const text = `SOURCE: wttr.in weather (${place})\nCurrent weather for ${place}: ${desc}, ${current.temp_F}°F / ${current.temp_C}°C${feels}${humidity}${wind}. Observation time: ${current.observation_time || 'unknown UTC'}.`;
    return {
      text,
      items: [{
        title: `Weather for ${place}`,
        url: `https://wttr.in/${encodeURIComponent(location)}`,
        snippet: `${desc}, ${current.temp_F}°F`,
      }],
    };
  } catch {
    return null;
  }
}

function handleDateTime(query: string): SearchResult | null {
  if (!/\b(what year is it|current year|today'?s date|what date is it|current date|current time)\b/i.test(query)) {
    return null;
  }
  const now = new Date();
  const text = `SOURCE: Worker clock\nCurrent UTC date/time: ${now.toISOString()}. Current year: ${now.getUTCFullYear()}.`;
  return {
    text,
    items: [{
      title: 'Worker clock',
      url: 'https://developers.cloudflare.com/workers/runtime-apis/performance/',
      snippet: `Current UTC year: ${now.getUTCFullYear()}`,
    }],
  };
}

async function fetchPagesParallel(urls: string[]): Promise<(string | null)[]> {
  // Fetch all pages in parallel, abandon any that exceed the budget
  const deadline = Date.now() + JINA_BUDGET_MS;
  const budget = new Promise<null>(resolve => setTimeout(() => resolve(null), JINA_BUDGET_MS));

  const fetches = urls.map(url =>
    Promise.race([fetchJinaPage(url), budget])
  );

  // Wait for all, but each one is already racing against the budget
  return Promise.all(fetches);
}

async function handleSearch(query: string, env: Env): Promise<Response> {
  const dateTime = handleDateTime(query);
  if (dateTime) return Response.json(dateTime);

  if (/\b(weather|forecast|temperature)\b/i.test(query)) {
    const weather = await handleWeather(query);
    if (weather) return Response.json(weather);
  }

  // 1. Get search results
  let items: SearchItem[] = [];
  if (env.BRAVE_KEY) {
    items = await braveSearch(query, env.BRAVE_KEY, 5);
  }
  if (items.length === 0) {
    items = await ddgSearch(query, 8);
  }
  const fallbackItems = fallbackItemsForQuery(query);
  items = rankItems(query, [...items, ...fallbackItems]);
  if (items.length === 0 && fallbackItems.length > 0) {
    items = fallbackItems;
  }

  if (items.length === 0) {
    return Response.json({ text: '', items: [] });
  }

  const top = items.slice(0, PAGES_TO_READ + 1);

  // 2. Fetch top pages in parallel with 5s budget. Keep this aligned 1:1 with
  // `top` by index — fetchJinaPage already returns null for empty/invalid
  // urls, so don't filter here (filtering would shift indices and attribute
  // one source's fetched content to a different source's title/domain).
  const urls = top.slice(0, PAGES_TO_READ).map(it => it.url);
  const pageContents = await fetchPagesParallel(urls);

  // 3. Build result text
  const text = top.map((it, i) => {
    const domain = domainOf(it.url);
    const content = pageContents[i];
    const body = content || it.snippet || '(no content)';
    return `SOURCE: ${it.title}${domain ? ` (${domain})` : ''}\n${body}`;
  }).join('\n\n---\n\n').slice(0, RESULT_TEXT_CAP);

  return Response.json({ text, items: top });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // CORS for local dev
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-search-token',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === '/search' && request.method === 'POST') {
      if (env.SEARCH_TOKEN && request.headers.get('x-search-token') !== env.SEARCH_TOKEN) {
        return Response.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders });
      }
      try {
        const body: any = await request.json();
        const query = (body?.query ?? '').trim();
        if (!query || query.length < 2) {
          return Response.json({ error: 'query required' }, { status: 400, headers: corsHeaders });
        }
        const normalized = normalizeQuery(query);
        const ttl = cacheTtlSeconds(query);
        const cacheKey = new Request(`${SEARCH_CACHE_PREFIX}?q=${encodeURIComponent(normalized)}`);
        const cached = await caches.default.match(cacheKey);
        if (cached) {
          return new Response(cached.body, {
            status: cached.status,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
              'Cache-Control': `public, max-age=${ttl}`,
              'X-Search-Cache': 'HIT',
            },
          });
        }

        const result = await handleSearch(query, env);
        const data = await result.json();
        const response = Response.json(data, {
          headers: {
            ...corsHeaders,
            'Cache-Control': `public, max-age=${ttl}`,
            'X-Search-Cache': 'MISS',
          },
        });
        ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
        return response;
      } catch (e) {
        return Response.json({ error: 'internal error' }, { status: 500, headers: corsHeaders });
      }
    }

    if (url.pathname === '/health') {
      return Response.json({ ok: true, brave: !!env.BRAVE_KEY }, { headers: corsHeaders });
    }

    return new Response('Not found', { status: 404 });
  },

  async scheduled(_event: ScheduledEvent, _env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      fetch(BACKEND_HEALTH_URL).catch(() => {
        /* best-effort keep-warm ping; a miss just means the next one tries again */
      }),
    );
  },
};
