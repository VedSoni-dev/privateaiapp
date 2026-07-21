/**
 * BackendClient — the only thing that talks to our backend (deployed on
 * Render), which in turn talks to the Privatemode confidential-compute
 * proxy. The app never holds an API key or talks to Privatemode directly.
 */
// IMPORTANT: streaming uses expo/fetch, NOT the global React Native fetch.
// RN's built-in fetch (whatwg-fetch over XMLHttpRequest) does not expose a
// readable `response.body`, so `res.body.getReader()` throws on device and
// every message failed with a generic error. expo/fetch is WinterCG-compliant
// and streams response bodies natively.
import { fetch as expoFetch } from 'expo/fetch';
import { getDeviceId } from './DeviceId';

// Render web service URL — update if the service is renamed/redeployed elsewhere.
const BACKEND_URL = 'https://private-ai-backend.onrender.com';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCallRequest[];
}

export interface ToolCallRequest {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  tools?: ToolSpec[];
  /** Hard cap on how long the request may take. Default 30s. */
  timeoutMs?: number;
}

export interface ChatResult {
  text: string;
  toolCalls?: ToolCallRequest[];
}

async function headers(): Promise<Record<string, string>> {
  return {
    'Content-Type': 'application/json',
    'x-device-id': await getDeviceId(),
  };
}

/** Non-streaming call — used for the tool-decision turn and background memory work. */
export async function chatComplete(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
  // Without a timeout, a hung connection means an infinite spinner for the
  // user. Abort hard and let callers decide (decision pass fails open,
  // ChatScreen shows the "took too long" message).
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000);
  try {
    const res = await fetch(`${BACKEND_URL}/v1/chat`, {
      method: 'POST',
      headers: await headers(),
      body: JSON.stringify({
        messages,
        stream: false,
        maxTokens: opts.maxTokens ?? 400,
        temperature: opts.temperature ?? 0.3,
        tools: opts.tools,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`backend chat failed: ${res.status}`);
    const data = await res.json();
    const choice = data?.choices?.[0]?.message;
    return {
      text: choice?.content || '',
      toolCalls: choice?.tool_calls,
    };
  } catch (e) {
    // Re-label our own timeout abort so it doesn't get mistaken for a
    // user-initiated cancel upstream (ChatScreen swallows abort errors).
    if (ctrl.signal.aborted) throw new Error('request timed out');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export interface StreamOptions extends ChatOptions {
  onToken: (accumulated: string) => void;
  signal?: AbortSignal;
}

export interface StreamResult {
  text: string;
}

/**
 * Streaming call — parses the backend's relayed OpenAI-compatible SSE stream.
 *
 * Streaming goes through expo/fetch, which is backed by a native module. If
 * that module isn't available on the device (or anything else in the streaming
 * path throws before the first token), we fall back to the plain non-streaming
 * call — that uses React Native's built-in fetch + res.json(), which works
 * everywhere. The user gets the whole answer at once instead of a red error.
 */
export async function chatStream(messages: ChatMessage[], opts: StreamOptions): Promise<StreamResult> {
  let text = '';
  let gotFirstToken = false;

  // Internal controller so we can watchdog the connection ourselves while
  // still honoring the caller's stop button. A watchdog abort is NOT a user
  // abort — it falls through to the non-streaming fallback below.
  const ctrl = new AbortController();
  const onUserAbort = () => ctrl.abort();
  if (opts.signal?.aborted) ctrl.abort();
  else opts.signal?.addEventListener('abort', onUserAbort);
  // If no token has arrived within 25s the stream is considered hung.
  let watchdog: ReturnType<typeof setTimeout> | null = setTimeout(() => ctrl.abort(), 25_000);
  const clearWatchdog = () => { if (watchdog) { clearTimeout(watchdog); watchdog = null; } };

  try {
    const res = await expoFetch(`${BACKEND_URL}/v1/chat`, {
      method: 'POST',
      headers: await headers(),
      body: JSON.stringify({
        messages,
        stream: true,
        maxTokens: opts.maxTokens ?? 800,
        temperature: opts.temperature ?? 0.7,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`stream status ${res.status}`);
    if (!res.body?.getReader) throw new Error('no readable stream body');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload);
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta) {
            text += delta;
            if (!gotFirstToken) { gotFirstToken = true; clearWatchdog(); }
            opts.onToken(text);
          }
        } catch {
          /* ignore malformed SSE lines */
        }
      }
    }

    return { text };
  } catch (streamErr) {
    // User pressed stop — a genuine cancel, don't silently re-run the request.
    if (opts.signal?.aborted) throw streamErr;
    // If tokens were already flowing, streaming works on this device and this
    // is a real mid-stream network failure — surface it rather than double-run.
    if (gotFirstToken) throw streamErr;

    // Streaming transport unavailable (e.g. expo/fetch native module missing,
    // or the connection hung past the watchdog). Fall back to the standard
    // non-streaming path so the user still gets an answer.
    console.warn('[BackendClient] streaming unavailable, falling back to non-streaming:', String((streamErr as Error)?.message ?? streamErr));
    const result = await chatComplete(messages, {
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
      timeoutMs: 45_000,
    });
    if (result.text) opts.onToken(result.text);
    return { text: result.text };
  } finally {
    clearWatchdog();
    opts.signal?.removeEventListener('abort', onUserAbort);
  }
}
