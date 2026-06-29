/**
 * Private AI — Search Worker
 * Cloudflare Worker that handles all web search on behalf of the app.
 * Device sends { query } → Worker fetches Brave/DDG + Jina → returns <5KB JSON.
 * LLM model memory never competes with page-fetch buffers.
 */

export interface Env {
  BRAVE_KEY?: string;
}

interface SearchItem {
  title: string;
  url: string;
  snippet: string;
}

const SKIP_DOMAINS = [
  'youtube.com', 'twitter.com', 'x.com', 'instagram.com',
  'tiktok.com', 'facebook.com', 'linkedin.com',
];

const PAGE_CONTENT_CAP = 1800;
const PAGES_TO_READ = 2;
const JINA_BUDGET_MS = 5000;
const RESULT_TEXT_CAP = 2200;

function domainOf(url = ''): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

function shouldSkip(url: string): boolean {
  const host = domainOf(url);
  return SKIP_DOMAINS.some(d => host.includes(d));
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
  const m = href.match(/[?&]uddg=([^&]+)/);
  if (m) { try { return decodeURIComponent(m[1]); } catch { return ''; } }
  return href.startsWith('http') ? href : '';
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
    if (!title) continue;
    items.push({ title, url: ddgRealUrl(titles[i][1]), snippet: snippets[i] || '' });
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

async function fetchJinaPage(url: string): Promise<string | null> {
  if (!url || !url.startsWith('http') || shouldSkip(url)) return null;
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: 'text/plain', 'User-Agent': 'Mozilla/5.0 (compatible; PrivateAI/1.0)' },
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length < 100) return null;
    return text
      .replace(/^(Title:|URL:|Published Time:)[^\n]*\n/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, PAGE_CONTENT_CAP);
  } catch {
    return null;
  }
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
  // 1. Get search results
  let items: SearchItem[] = [];
  if (env.BRAVE_KEY) {
    items = await braveSearch(query, env.BRAVE_KEY, 5);
  }
  if (items.length === 0) {
    items = await ddgSearch(query, 5);
  }

  if (items.length === 0) {
    return Response.json({ text: '', items: [] });
  }

  const top = items.slice(0, PAGES_TO_READ + 1);

  // 2. Fetch top pages in parallel with 5s budget
  const urls = top.slice(0, PAGES_TO_READ).map(it => it.url).filter(Boolean);
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
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS for local dev
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === '/search' && request.method === 'POST') {
      try {
        const body: any = await request.json();
        const query = (body?.query ?? '').trim();
        if (!query || query.length < 2) {
          return Response.json({ error: 'query required' }, { status: 400, headers: corsHeaders });
        }
        const result = await handleSearch(query, env);
        // Add CORS headers to actual response
        const data = await result.json();
        return Response.json(data, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: 'internal error' }, { status: 500, headers: corsHeaders });
      }
    }

    if (url.pathname === '/health') {
      return Response.json({ ok: true, brave: !!env.BRAVE_KEY }, { headers: corsHeaders });
    }

    return new Response('Not found', { status: 404 });
  },
};
