/**
 * BackendClient — the only thing that talks to our Fly.io backend, which in
 * turn talks to the Privatemode confidential-compute proxy. The app never
 * holds an API key or talks to Privatemode directly.
 */
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
  });
  if (!res.ok) throw new Error(`backend chat failed: ${res.status}`);
  const data = await res.json();
  const choice = data?.choices?.[0]?.message;
  return {
    text: choice?.content || '',
    toolCalls: choice?.tool_calls,
  };
}

export interface StreamOptions extends ChatOptions {
  onToken: (accumulated: string) => void;
  signal?: AbortSignal;
}

export interface StreamResult {
  text: string;
}

/** Streaming call — parses the backend's relayed OpenAI-compatible SSE stream. */
export async function chatStream(messages: ChatMessage[], opts: StreamOptions): Promise<StreamResult> {
  const res = await fetch(`${BACKEND_URL}/v1/chat`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({
      messages,
      stream: true,
      maxTokens: opts.maxTokens ?? 800,
      temperature: opts.temperature ?? 0.7,
    }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw new Error(`backend chat stream failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';

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
          opts.onToken(text);
        }
      } catch {
        /* ignore malformed SSE lines */
      }
    }
  }

  return { text };
}
