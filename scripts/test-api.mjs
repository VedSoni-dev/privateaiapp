#!/usr/bin/env node
/**
 * API smoke test — verifies the backend + search worker are healthy and that
 * both the non-streaming and streaming chat contracts work end to end.
 *
 * Run:  node scripts/test-api.mjs
 *
 * NOTE: this exercises the SERVER SIDE (Render backend + Cloudflare worker).
 * It uses Node's global fetch, which supports streaming — so a green run here
 * does NOT prove the React Native app can stream (the app must use expo/fetch,
 * since RN's built-in fetch has no readable response body). This is the tool
 * to reach for when someone reports "the app says something went wrong": if
 * this passes, the failure is client-side, not the API.
 */

const BACKEND_URL = process.env.BACKEND_URL || 'https://private-ai-backend.onrender.com';
const WORKER_URL = process.env.WORKER_URL || 'https://private-ai-search.vedantn06soni.workers.dev';
const DEVICE_ID = 'api-smoke-test';

let passed = 0;
let failed = 0;

function ok(name, detail = '') {
  passed++;
  console.log(`  \x1b[32m✓\x1b[0m ${name}${detail ? `  \x1b[2m${detail}\x1b[0m` : ''}`);
}
function fail(name, detail = '') {
  failed++;
  console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? `  \x1b[31m${detail}\x1b[0m` : ''}`);
}

async function withTiming(fn) {
  const start = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - start };
}

async function testBackendHealth() {
  console.log('\nBackend health');
  try {
    const { result: res, ms } = await withTiming(() =>
      fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(70_000) }),
    );
    if (!res.ok) return fail('GET /health', `status ${res.status}`);
    const data = await res.json();
    if (data?.ok) ok('GET /health', `${ms}ms`);
    else fail('GET /health', `unexpected body: ${JSON.stringify(data)}`);
    if (ms > 5000) console.log(`    \x1b[33m⚠ cold start (${ms}ms) — first user request would be slow\x1b[0m`);
  } catch (e) {
    fail('GET /health', String(e?.message || e));
  }
}

async function testChatNonStreaming() {
  console.log('\nChat — non-streaming (used for search-decision + memory)');
  try {
    const { result: res, ms } = await withTiming(() =>
      fetch(`${BACKEND_URL}/v1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-device-id': DEVICE_ID },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'Reasoning: low\n\nYou are a helpful assistant.' },
            { role: 'user', content: 'Reply with exactly the word: PONG' },
          ],
          stream: false,
          maxTokens: 200,
          temperature: 0,
        }),
        signal: AbortSignal.timeout(70_000),
      }),
    );
    if (!res.ok) return fail('POST /v1/chat (stream:false)', `status ${res.status}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === 'string') ok('POST /v1/chat (stream:false)', `${ms}ms, "${content.slice(0, 40).replace(/\n/g, ' ')}"`);
    else fail('POST /v1/chat (stream:false)', `no message content in response`);
  } catch (e) {
    fail('POST /v1/chat (stream:false)', String(e?.message || e));
  }
}

async function testChatStreaming() {
  console.log('\nChat — streaming (the main answer path)');
  try {
    const start = Date.now();
    const res = await fetch(`${BACKEND_URL}/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-id': DEVICE_ID },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: 'Reasoning: low\n\nYou are a helpful assistant.' },
          { role: 'user', content: 'Count from 1 to 5.' },
        ],
        stream: true,
        maxTokens: 300,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(70_000),
    });
    if (!res.ok) return fail('POST /v1/chat (stream:true)', `status ${res.status}`);
    if (!res.body) return fail('POST /v1/chat (stream:true)', 'no response body to stream');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    let chunks = 0;
    let firstTokenMs = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload);
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta) {
            if (!firstTokenMs) firstTokenMs = Date.now() - start;
            text += delta;
            chunks++;
          }
        } catch {
          /* ignore malformed SSE lines */
        }
      }
    }
    if (chunks > 0 && text) {
      ok('POST /v1/chat (stream:true)', `${chunks} chunks, first token ${firstTokenMs}ms, "${text.slice(0, 40).replace(/\n/g, ' ')}"`);
    } else {
      fail('POST /v1/chat (stream:true)', 'stream produced no content deltas');
    }
  } catch (e) {
    fail('POST /v1/chat (stream:true)', String(e?.message || e));
  }
}

async function testWorker() {
  console.log('\nSearch worker');
  try {
    const { result: res, ms } = await withTiming(() =>
      fetch(`${WORKER_URL}/health`, { signal: AbortSignal.timeout(15_000) }),
    );
    const data = await res.json();
    if (res.ok && data?.ok) ok('GET /health', `${ms}ms, brave=${data.brave}`);
    else fail('GET /health', `status ${res.status}`);
  } catch (e) {
    fail('GET /health', String(e?.message || e));
  }

  try {
    const { result: res, ms } = await withTiming(() =>
      fetch(`${WORKER_URL}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'what year is it' }),
        signal: AbortSignal.timeout(15_000),
      }),
    );
    if (!res.ok) return fail('POST /search', `status ${res.status}`);
    const data = await res.json();
    const items = data?.items?.length ?? 0;
    if (items > 0 || data?.text) ok('POST /search', `${ms}ms, ${items} items, ${String(data.text || '').length}ch`);
    else fail('POST /search', 'returned no results (may be transient — search providers throttle)');
  } catch (e) {
    fail('POST /search', String(e?.message || e));
  }
}

(async () => {
  console.log(`\x1b[1mPrivate AI — API smoke test\x1b[0m`);
  console.log(`  backend: ${BACKEND_URL}`);
  console.log(`  worker:  ${WORKER_URL}`);

  await testBackendHealth();
  await testChatNonStreaming();
  await testChatStreaming();
  await testWorker();

  console.log(`\n\x1b[1mResult:\x1b[0m ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
