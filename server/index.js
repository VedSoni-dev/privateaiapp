import express from 'express';
import cors from 'cors';
import { spawn } from 'node:child_process';

const PORT = process.env.PORT || 3000;
const PROXY_PORT = Number(process.env.PRIVATEMODE_PROXY_PORT || 8080);
const PROXY_URL = `http://127.0.0.1:${PROXY_PORT}/v1`;
const MODEL = process.env.PRIVATEMODE_MODEL || 'gpt-oss-120b';

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

// The client date is only honored within +/- 1 day of server time (timezone
// tolerance). Anything further is a spoof attempt to reset the daily counter.
function toDateKey(input) {
  const serverDate = new Date().toISOString().slice(0, 10);
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return serverDate;
  const diffMs = Math.abs(new Date(`${input}T00:00:00Z`) - new Date(`${serverDate}T00:00:00Z`));
  return diffMs <= 26 * 60 * 60 * 1000 ? input : serverDate;
}

function usageSummary(date, messages, isPro, source = 'memory') {
  return {
    date,
    messages,
    isPro,
    limit: FREE_DAILY_LIMIT,
    remaining: isPro ? null : Math.max(0, FREE_DAILY_LIMIT - messages),
    source,
  };
}

function deviceKey(req) {
  const deviceId = req.header('x-device-id');
  if (!deviceId) return null;
  return deviceId.trim();
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

function memoryRecord(deviceId, dateKey, delta = 0, isPro) {
  const current = memoryUsage.get(deviceId) || { date: dateKey, messages: 0, isPro: false };
  const next = {
    date: dateKey,
    messages: Math.max(0, current.date === dateKey ? current.messages + delta : delta),
    isPro: typeof isPro === 'boolean' ? isPro : current.isPro,
  };
  memoryUsage.set(deviceId, next);
  return next;
}

function memoryGet(deviceId, dateKey) {
  const current = memoryUsage.get(deviceId) || { date: dateKey, messages: 0, isPro: false };
  const next = current.date === dateKey
    ? current
    : { date: dateKey, messages: 0, isPro: current.isPro };
  memoryUsage.set(deviceId, next);
  return next;
}

async function usageGetRecord(deviceId, dateKey) {
  if (!redisEnabled()) {
    const record = memoryGet(deviceId, dateKey);
    return usageSummary(dateKey, record.messages, record.isPro, 'memory');
  }

  const usageKey = `usage:${deviceId}:${dateKey}`;
  const entKey = `ent:${deviceId}`;
  const [messagesRaw, proRaw] = await Promise.all([
    redisCommand('get', [usageKey]),
    redisCommand('get', [entKey]),
  ]);
  const messages = Number(messagesRaw || 0);
  const isPro = String(proRaw || '') === '1' || String(proRaw || '').toLowerCase() === 'true';
  return usageSummary(dateKey, Number.isFinite(messages) ? messages : 0, isPro, 'redis');
}

async function usageIncrement(deviceId, dateKey) {
  if (!redisEnabled()) {
    const record = memoryRecord(deviceId, dateKey, 1);
    return usageSummary(dateKey, record.messages, record.isPro, 'memory');
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
  return usageSummary(dateKey, Number.isFinite(messages) ? messages : 0, isPro, 'redis');
}

async function usageDecrement(deviceId, dateKey) {
  if (!redisEnabled()) {
    memoryRecord(deviceId, dateKey, -1);
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

async function usageSetPro(deviceId, dateKey, isPro) {
  if (!redisEnabled()) {
    const record = memoryGet(deviceId, dateKey);
    memoryUsage.set(deviceId, { ...record, isPro });
    return usageSummary(dateKey, record.messages, isPro, 'memory');
  }

  const entKey = `ent:${deviceId}`;
  await redisCommand('set', [entKey, isPro ? '1' : '0']);
  const usage = await usageGetRecord(deviceId, dateKey);
  return usageSummary(usage.date, usage.messages, isPro, 'redis');
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

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, error: 'messages array required' };
  }
  if (messages.length > MAX_MESSAGES) {
    return { ok: false, error: `too many messages; max ${MAX_MESSAGES}` };
  }

  let totalChars = 0;
  const cleaned = [];
  for (const message of messages) {
    const role = message?.role;
    const content = typeof message?.content === 'string' ? message.content : '';
    if (!['system', 'user', 'assistant', 'tool'].includes(role)) {
      return { ok: false, error: 'invalid message role' };
    }
    if (content.length > MAX_MESSAGE_CHARS) {
      return { ok: false, error: `message too long; max ${MAX_MESSAGE_CHARS} chars` };
    }
    totalChars += content.length;
    if (totalChars > MAX_TOTAL_CHARS) {
      return { ok: false, error: `conversation too long; max ${MAX_TOTAL_CHARS} chars` };
    }
    cleaned.push({
      role,
      content,
      ...(message.tool_call_id ? { tool_call_id: message.tool_call_id } : {}),
      ...(Array.isArray(message.tool_calls) ? { tool_calls: message.tool_calls } : {}),
    });
  }

  return { ok: true, messages: cleaned };
}

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

  const validated = validateMessages(messages);
  if (!validated.ok) return res.status(400).json({ error: validated.error });

  const deviceId = deviceKey(req);
  const dateKey = toDateKey(req.header('x-client-date'));
  const isStreamRequest = Boolean(stream);
  // Usage is counted HERE, not by the client. A streaming call is what the
  // user perceives as one message; non-streaming calls (tool decision,
  // memory extraction) ride along but count toward the total-call backstop.
  let messageCounted = false;
  if (deviceId) {
    try {
      const totalCalls = await callsIncrement(deviceId, dateKey);
      const usage = isStreamRequest
        ? await usageIncrement(deviceId, dateKey)
        : await usageGetRecord(deviceId, dateKey);
      messageCounted = isStreamRequest;

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
          usage: usageSummary(dateKey, Math.min(usage.messages, FREE_DAILY_LIMIT), usage.isPro, usage.source),
        });
      }
    } catch (error) {
      console.warn('[chat] usage gate unavailable; allowing request', error);
    }
  }

  const body = {
    model: MODEL,
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
