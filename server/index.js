import express from 'express';
import cors from 'cors';
import { spawn } from 'node:child_process';

const PORT = process.env.PORT || 3000;
const PROXY_PORT = 8080;
const PROXY_URL = `http://127.0.0.1:${PROXY_PORT}/v1`;
const MODEL = process.env.PRIVATEMODE_MODEL || 'gpt-oss-120b';

const apiKey = process.env.PRIVATEMODE_API_KEY;
if (!apiKey) {
  console.error('PRIVATEMODE_API_KEY is not set — refusing to start.');
  process.exit(1);
}

// ── Start the Privatemode encryption proxy as a child process ──────────────
// It handles TEE remote attestation + end-to-end encryption to the model.
// We never see or forward the raw API key past this point.
const proxy = spawn('/bin/privatemode-proxy', ['--apiKey', apiKey, '--port', String(PROXY_PORT)], {
  stdio: ['ignore', 'inherit', 'inherit'],
});
proxy.on('exit', (code) => {
  console.error(`privatemode-proxy exited with code ${code} — shutting down.`);
  process.exit(1);
});

async function waitForProxy(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${PROXY_URL}/models`);
      if (res.ok || res.status === 404) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ── Very small per-device rate limiter (in-memory sliding window) ──────────
// Not a substitute for real abuse controls, but stops a single runaway
// client from draining the shared Privatemode token budget.
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const hits = new Map(); // deviceId -> timestamps[]

function rateLimit(req, res, next) {
  const deviceId = req.header('x-device-id');
  if (!deviceId) {
    return res.status(400).json({ error: 'x-device-id header required' });
  }
  const now = Date.now();
  const arr = (hits.get(deviceId) || []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ error: 'rate limit exceeded, slow down' });
  }
  arr.push(now);
  hits.set(deviceId, arr);
  next();
}

// Periodically clear stale rate-limit entries so the map doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [id, arr] of hits) {
    const fresh = arr.filter((t) => now - t < WINDOW_MS);
    if (fresh.length === 0) hits.delete(id);
    else hits.set(id, fresh);
  }
}, WINDOW_MS).unref();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', async (_req, res) => {
  res.json({ ok: true });
});

// ── Chat proxy — the only endpoint the app talks to ─────────────────────────
// Body: { messages: [...], stream?: boolean, maxTokens?: number, temperature?: number }
// The app never sees the Privatemode API key or talks to the proxy directly.
app.post('/v1/chat', rateLimit, async (req, res) => {
  const { messages, stream = false, maxTokens = 800, temperature = 0.7 } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  try {
    const upstream = await fetch(`${PROXY_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '');
      console.error('[chat] upstream error', upstream.status, text.slice(0, 500));
      return res.status(502).json({ error: 'upstream inference failed' });
    }

    if (!stream) {
      const data = await upstream.json();
      return res.json(data);
    }

    // Relay SSE stream straight through.
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    for await (const chunk of upstream.body) {
      res.write(chunk);
    }
    res.end();
  } catch (e) {
    console.error('[chat] request failed', e);
    if (!res.headersSent) res.status(502).json({ error: 'upstream request failed' });
  }
});

(async () => {
  const up = await waitForProxy();
  if (!up) {
    console.error('privatemode-proxy did not become ready in time — exiting.');
    process.exit(1);
  }
  app.listen(PORT, () => console.log(`Backend listening on :${PORT}, proxying to ${PROXY_URL}`));
})();
