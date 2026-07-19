import express from 'express';
import cors from 'cors';
import { spawn } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { toDateKey, usageSummary, clampNumber, validateMessages, memoryRecord, memoryGet, rcEntitlementUpdates } from './logic.js';

const PORT = process.env.PORT || 3000;
const PROXY_PORT = Number(process.env.PRIVATEMODE_PROXY_PORT || 8080);
const PROXY_URL = `http://127.0.0.1:${PROXY_PORT}/v1`;
const MODEL = process.env.PRIVATEMODE_MODEL || 'gpt-oss-120b';
// Pinned version id (not "kimi-latest") so pricing/behavior don't shift
// under us — same reasoning as pinning gpt-oss-120b instead of a "-latest"
// alias. Only applied to the user-visible streaming answer for Pro users;
// internal non-streaming calls (decision pass, memory extraction) always
// use the cheap model since the user never sees that output directly.
const MODEL_PRO = process.env.PRIVATEMODE_MODEL_PRO || 'kimi-k2.6';

const JSON_LIMIT = process.env.JSON_LIMIT || '512kb';
const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const MAX_REQUESTS_PER_WINDOW = Number(process.env.RATE_LIMIT_MAX || 20);
const MAX_CONCURRENT_UPSTREAM = Number(process.env.MAX_CONCURRENT_UPSTREAM || 12);
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 90_000);
const MAX_MESSAGES = Number(process.env.MAX_MESSAGES || 40);
const MAX_MESSAGE_CHARS = Number(process.env.MAX_MESSAGE_CHARS || 16_000);
const MAX_TOTAL_CHARS = Number(process.env.MAX_TOTAL_CHARS || 80_000);
const MAX_TOKENS = Number(process.env.MAX_TOKENS || 1800);
const FREE_DAILY_LIMIT = Number(process.env.FREE_DAILY_LIMIT || 20);
// Backstop across ALL /v1/chat calls (decision passes, memory extraction,
// retries). A normal message costs 2-3 calls, so 8x leaves headroom while
// still capping a client that scripts non-streaming calls all day.
const MAX_DAILY_CALLS = Number(process.env.MAX_DAILY_CALLS || FREE_DAILY_LIMIT * 8);
// Client-asserted Pro is only acceptable while testing without StoreKit.
// Must stay off in production until receipt validation exists.
const ALLOW_CLIENT_PRO = process.env.ALLOW_CLIENT_PRO === 'true';
// Shared secret for the RevenueCat webhook (Authorization header value set in
// the RevenueCat dashboard). Unset → the endpoint refuses all requests.
const RC_WEBHOOK_AUTH = process.env.RC_WEBHOOK_AUTH || '';
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const apiKey = process.env.PRIVATEMODE_API_KEY;
if (!apiKey) {
  console.error('PRIVATEMODE_API_KEY is not set; refusing to start.');
  process.exit(1);
}

const proxy = spawn('/bin/privatemode-proxy', ['--apiKey', apiKey, '--port', String(PROXY_PORT)], {
  stdio: ['ignore', 'inherit', 'inherit'],
});

proxy.on('exit', (code) => {
  console.error(`privatemode-proxy exited with code ${code}; shutting down.`);
  process.exit(1);
});

async function waitForProxy(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${PROXY_URL}/models`, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status === 404) return true;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function deviceKey(req) {
  const deviceId = req.header('x-device-id');
  if (!deviceId) return null;
  return deviceId.trim();
}

// Binds usageSummary's imported (now limit-agnostic) signature to this
// server's configured FREE_DAILY_LIMIT, so call sites don't all need it threaded through.
function summarize(date, messages, isPro, source = 'memory') {
  return usageSummary(date, messages, isPro, FREE_DAILY_LIMIT, source);
}

function redisEnabled() {
  return Boolean(UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN);
}

function redisUrl(path) {
  return `${UPSTASH_REDIS_REST_URL.replace(/\/$/, '')}/${path}`;
}

async function redisCommand(command, args = [], init = {}) {
  if (!redisEnabled()) throw new Error('redis disabled');
  const encoded = [command, ...args].map(part => encodeURIComponent(String(part)));
  const url = new URL(redisUrl(encoded.join('/')));
  if (init.query) {
    for (const [key, value] of Object.entries(init.query)) {
      url.searchParams.set(key, String(value));
    }
  }
  const res = await fetch(url, {
    method: init.method || 'GET',
    headers: {
      Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error || `redis command failed: ${res.status}`);
  }
  return data.result;
}

const memoryUsage = new Map();

async function usageGetRecord(deviceId, dateKey) {
  if (!redisEnabled()) {
    const record = memoryGet(memoryUsage, deviceId, dateKey);
    return summarize(dateKey, record.messages, record.isPro, 'memory');
  }

  const usageKey = `usage:${deviceId}:${dateKey}`;
  const entKey = `ent:${deviceId}`;
  const [messagesRaw, proRaw] = await Promise.all([
    redisCommand('get', [usageKey]),
    redisCommand('get', [entKey]),
  ]);
  const messages = Number(messagesRaw || 0);
  const isPro = String(proRaw || '') === '1' || String(proRaw || '').toLowerCase() === 'true';
  return summarize(dateKey, Number.isFinite(messages) ? messages : 0, isPro, 'redis');
}

async function usageIncrement(deviceId, dateKey) {
  if (!redisEnabled()) {
    const record = memoryRecord(memoryUsage, deviceId, dateKey, 1);
    return summarize(dateKey, record.messages, record.isPro, 'memory');
  }

  const usageKey = `usage:${deviceId}:${dateKey}`;
  const entKey = `ent:${deviceId}`;
  const [messagesRaw, proRaw] = await Promise.all([
    redisCommand('incr', [usageKey]),
    redisCommand('get', [entKey]),
  ]);
  await redisCommand('expire', [usageKey, 60 * 60 * 48]).catch(() => {});
  const messages = Number(messagesRaw || 0);
  const isPro = String(proRaw || '') === '1' || String(proRaw || '').toLowerCase() === 'true';
  return summarize(dateKey, Number.isFinite(messages) ? messages : 0, isPro, 'redis');
}

async function usageDecrement(deviceId, dateKey) {
  if (!redisEnabled()) {
    memoryRecord(memoryUsage, deviceId, dateKey, -1);
    return;
  }
  await redisCommand('decr', [`usage:${deviceId}:${dateKey}`]);
}

const memoryCalls = new Map();

// Counts every /v1/chat call regardless of type; used as an abuse backstop.
async function callsIncrement(deviceId, dateKey) {
  if (!redisEnabled()) {
    const current = memoryCalls.get(deviceId) || { date: dateKey, calls: 0 };
    const calls = current.date === dateKey ? current.calls + 1 : 1;
    memoryCalls.set(deviceId, { date: dateKey, calls });
    return calls;
  }
  const key = `calls:${deviceId}:${dateKey}`;
  const calls = await redisCommand('incr', [key]);
  await redisCommand('expire', [key, 60 * 60 * 48]).catch(() => {});
  return Number(calls) || 0;
}

// Entitlement write with an expiry, for webhook-validated Pro. TTL slightly
// past the subscription's own expiration means a lapsed sub degrades to free
// automatically even if the EXPIRATION webhook never arrives.
async function entitlementSet(deviceId, isPro, ttlSeconds) {
  if (!redisEnabled()) {
    const record = memoryGet(memoryUsage, deviceId, toDateKey(undefined));
    memoryUsage.set(deviceId, { ...record, isPro });
    return;
  }
  const entKey = `ent:${deviceId}`;
  if (isPro && Number.isFinite(ttlSeconds) && ttlSeconds > 0) {
    await redisCommand('set', [entKey, '1'], { query: { EX: Math.ceil(ttlSeconds) } });
  } else {
    await redisCommand('set', [entKey, isPro ? '1' : '0']);
  }
}

async function usageSetPro(deviceId, dateKey, isPro) {
  if (!redisEnabled()) {
    const record = memoryGet(memoryUsage, deviceId, dateKey);
    memoryUsage.set(deviceId, { ...record, isPro });
    return summarize(dateKey, record.messages, isPro, 'memory');
  }

  const entKey = `ent:${deviceId}`;
  await redisCommand('set', [entKey, isPro ? '1' : '0']);
  const usage = await usageGetRecord(deviceId, dateKey);
  return summarize(usage.date, usage.messages, isPro, 'redis');
}

let inFlightUpstream = 0;
const hits = new Map();

function rateLimit(req, res, next) {
  const deviceId = deviceKey(req);
  if (!deviceId) {
    return res.status(400).json({ error: 'x-device-id header required' });
  }

  const key = `${deviceId}:${req.ip || 'unknown'}`;
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((time) => now - time < WINDOW_MS);
  if (arr.length >= MAX_REQUESTS_PER_WINDOW) {
    res.setHeader('Retry-After', '30');
    return res.status(429).json({ error: 'rate limit exceeded, slow down' });
  }

  arr.push(now);
  hits.set(key, arr);
  next();
}

function capacityGuard(_req, res, next) {
  if (inFlightUpstream >= MAX_CONCURRENT_UPSTREAM) {
    res.setHeader('Retry-After', '5');
    return res.status(503).json({ error: 'server busy, try again shortly' });
  }

  inFlightUpstream++;
  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      inFlightUpstream = Math.max(0, inFlightUpstream - 1);
    }
  };
  res.once('finish', release);
  res.once('close', release);
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [key, arr] of hits) {
    const fresh = arr.filter((time) => now - time < WINDOW_MS);
    if (fresh.length === 0) hits.delete(key);
    else hits.set(key, fresh);
  }
}, WINDOW_MS).unref();

const app = express();
app.set('trust proxy', 1);
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
}));
app.use(express.json({ limit: JSON_LIMIT }));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    model: MODEL,
    modelPro: MODEL_PRO,
    inFlight: inFlightUpstream,
    usageStore: redisEnabled() ? 'upstash' : 'memory',
    uptime: process.uptime(),
  });
});

app.get('/ready', async (_req, res) => {
  try {
    const upstream = await fetch(`${PROXY_URL}/models`, { signal: AbortSignal.timeout(2000) });
    const ok = upstream.ok || upstream.status === 404;
    res.status(ok ? 200 : 503).json({ ok, proxyStatus: upstream.status });
  } catch {
    res.status(503).json({ ok: false, proxyStatus: 0 });
  }
});

app.get('/v1/usage', rateLimit, async (req, res) => {
  const deviceId = deviceKey(req);
  if (!deviceId) return res.status(400).json({ error: 'x-device-id header required' });
  const dateKey = toDateKey(req.query.date || req.header('x-client-date'));
  try {
    const usage = await usageGetRecord(deviceId, dateKey);
    res.json({ usage });
  } catch (error) {
    console.error('[usage] read failed', error);
    res.status(500).json({ error: 'usage lookup failed' });
  }
});

// Historical endpoint: clients used to self-report message counts here.
// Counting now happens server-side in /v1/chat, so this is a read-only sync
// kept for already-shipped builds (incrementing here would double-count them).
app.post('/v1/usage/record', rateLimit, async (req, res) => {
  const deviceId = deviceKey(req);
  if (!deviceId) return res.status(400).json({ error: 'x-device-id header required' });
  const dateKey = toDateKey(req.body?.date || req.header('x-client-date'));
  try {
    const usage = await usageGetRecord(deviceId, dateKey);
    res.json({ usage });
  } catch (error) {
    console.error('[usage] read failed', error);
    res.status(500).json({ error: 'usage update failed' });
  }
});

app.post('/v1/usage/pro', rateLimit, async (req, res) => {
  if (!ALLOW_CLIENT_PRO) {
    return res.status(403).json({
      error: 'entitlement updates require purchase validation',
    });
  }
  const deviceId = deviceKey(req);
  if (!deviceId) return res.status(400).json({ error: 'x-device-id header required' });
  const dateKey = toDateKey(req.body?.date || req.header('x-client-date'));
  const isPro = Boolean(req.body?.isPro);
  try {
    const usage = await usageSetPro(deviceId, dateKey, isPro);
    res.json({ usage });
  } catch (error) {
    console.error('[usage] entitlement update failed', error);
    res.status(500).json({ error: 'entitlement update failed' });
  }
});

function secretMatches(provided, expected) {
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

// RevenueCat server-to-server webhook — the receipt-validated path that makes
// ALLOW_CLIENT_PRO unnecessary in production. RevenueCat authenticates with
// the exact Authorization header value configured in its dashboard; compare
// against RC_WEBHOOK_AUTH (accept with or without a "Bearer " prefix, since
// the dashboard field is free-form). No rateLimit middleware: requests come
// from RevenueCat, not devices, so there is no x-device-id header.
app.post('/v1/rc-webhook', async (req, res) => {
  if (!RC_WEBHOOK_AUTH) {
    return res.status(503).json({ error: 'webhook not configured' });
  }
  const auth = req.header('authorization') || '';
  if (!secretMatches(auth, RC_WEBHOOK_AUTH) && !secretMatches(auth, `Bearer ${RC_WEBHOOK_AUTH}`)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const event = req.body?.event;
  const updates = rcEntitlementUpdates(event);
  try {
    for (const update of updates) {
      await entitlementSet(update.deviceId, update.isPro, update.ttlSeconds);
    }
    // Always 200 for authenticated events we ignore (CANCELLATION, TEST, …)
    // so RevenueCat doesn't retry them forever.
    console.log(`[rc-webhook] ${event?.type || 'unknown'}: applied ${updates.length} update(s)`);
    res.json({ ok: true, applied: updates.length });
  } catch (error) {
    console.error('[rc-webhook] entitlement write failed', error);
    // 5xx so RevenueCat retries — a dropped grant here is a paying user
    // stuck on the free tier.
    res.status(500).json({ error: 'entitlement update failed' });
  }
});

async function fetchUpstreamWithRetry(body, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const upstream = await fetch(`${PROXY_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      if (upstream.ok && upstream.body) return upstream;
      const text = await upstream.text().catch(() => '');
      lastError = new Error(`status ${upstream.status}: ${text.slice(0, 300)}`);
    } catch (error) {
      lastError = error;
    }
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 400 * (i + 1)));
    }
  }
  throw lastError;
}

app.post('/v1/chat', rateLimit, capacityGuard, async (req, res) => {
  const {
    messages,
    stream = false,
    maxTokens = 800,
    temperature = 0.7,
    tools,
  } = req.body || {};

  const validated = validateMessages(messages, {
    maxMessages: MAX_MESSAGES,
    maxMessageChars: MAX_MESSAGE_CHARS,
    maxTotalChars: MAX_TOTAL_CHARS,
  });
  if (!validated.ok) return res.status(400).json({ error: validated.error });

  const deviceId = deviceKey(req);
  const dateKey = toDateKey(req.header('x-client-date'));
  const isStreamRequest = Boolean(stream);
  // Usage is counted HERE, not by the client. A streaming call is what the
  // user perceives as one message; non-streaming calls (tool decision,
  // memory extraction) ride along but count toward the total-call backstop.
  let messageCounted = false;
  // Defaults to false (cheap model) if the usage gate is unreachable — an
  // entitlement lookup failure should never accidentally route someone to
  // the pricier model.
  let isPro = false;
  if (deviceId) {
    try {
      const totalCalls = await callsIncrement(deviceId, dateKey);
      const usage = isStreamRequest
        ? await usageIncrement(deviceId, dateKey)
        : await usageGetRecord(deviceId, dateKey);
      messageCounted = isStreamRequest;
      isPro = usage.isPro;

      const overMessages = isStreamRequest
        ? usage.messages > FREE_DAILY_LIMIT
        : usage.messages >= FREE_DAILY_LIMIT;
      if (!usage.isPro && (overMessages || totalCalls > MAX_DAILY_CALLS)) {
        if (messageCounted) {
          await usageDecrement(deviceId, dateKey).catch(() => {});
          messageCounted = false;
        }
        return res.status(402).json({
          error: 'daily message limit reached',
          usage: summarize(dateKey, Math.min(usage.messages, FREE_DAILY_LIMIT), usage.isPro, usage.source),
        });
      }
    } catch (error) {
      console.warn('[chat] usage gate unavailable; allowing request', error);
    }
  }

  const body = {
    model: isStreamRequest && isPro ? MODEL_PRO : MODEL,
    messages: validated.messages,
    max_tokens: clampNumber(maxTokens, 800, 1, MAX_TOKENS),
    temperature: clampNumber(temperature, 0.7, 0, 1.5),
    ...(Array.isArray(tools) && tools.length > 0 ? { tools } : {}),
    stream: Boolean(stream),
  };

  try {
    const upstream = await fetchUpstreamWithRetry(body, body.stream ? 2 : 3);

    if (!body.stream) {
      const data = await upstream.json();
      return res.json(data);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    for await (const chunk of upstream.body) {
      if (res.destroyed) break;
      res.write(chunk);
    }
    res.end();
  } catch (error) {
    console.error('[chat] upstream failed after retries', error);
    // The user got nothing; don't charge their daily quota for it.
    if (messageCounted && deviceId) {
      await usageDecrement(deviceId, dateKey).catch(() => {});
    }
    if (!res.headersSent) res.status(502).json({ error: 'upstream inference failed' });
  }
});

function shutdown() {
  proxy.kill('SIGTERM');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

(async () => {
  const up = await waitForProxy();
  if (!up) {
    console.error('privatemode-proxy did not become ready in time; exiting.');
    process.exit(1);
  }
  app.listen(PORT, () => console.log(`Backend listening on :${PORT}, proxying to ${PROXY_URL}`));
})();
