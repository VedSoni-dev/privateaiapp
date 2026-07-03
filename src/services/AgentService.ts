/**
 * AgentService v4 — agentic tool-use orchestration against the cloud backend.
 *
 * Inference now runs on Privatemode's confidential-compute cloud (via our
 * own backend, see server/) instead of on-device. This removes the iOS
 * memory/jetsam constraints that shaped earlier versions of this file, and
 * lets us use real OpenAI-style tool calling instead of a heuristic decision
 * pass: the model sees a `web_search` tool definition and decides on its own
 * whether to call it, with what query, via the API's native tool_calls field.
 *
 * Tools:
 *   • web_search    — real tool call; model decides when to invoke it
 *   • memory_recall — relevant long-term facts about the user (cheap, local,
 *     injected directly into the system prompt — no round trip needed)
 *   • datetime      — current date/time (always injected, free)
 */
import * as Memory from './MemoryService';
import { webSearch } from './WebSearchService';
import { buildAttachmentBlock, type Attachment } from './AttachmentService';
import { chatComplete, chatStream, type ChatMessage, type ToolSpec } from './BackendClient';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentMessage {
  isUser: boolean;
  text: string;
  isError?: boolean;
}

export type ToolName = 'web_search' | 'memory_recall' | 'datetime';

export interface ToolCall {
  tool: ToolName;
  query?: string;
  result: string;
  found: boolean;
}

export interface PrepareTurnOptions {
  history: AgentMessage[];
  userText: string;
  webEnabled: boolean;
  attachments?: Attachment[];
  onStatus?: (status: StatusEvent) => void;
}

export type StatusEvent =
  | { type: 'searching'; query: string }
  | { type: 'recalling' }
  | { type: 'compacting' };

export interface PreparedTurn {
  messages: ChatMessage[];
  toolCalls: ToolCall[];
}

// ── System persona ────────────────────────────────────────────────────────────

// gpt-oss is a reasoning model — "Reasoning: low" (its documented effort
// control) keeps hidden reasoning short so more of the token budget goes to
// the actual answer instead of getting cut off mid-thought (content: null).
const PERSONA =
  'Reasoning: low\n\n' +
  'You are Private AI — a fast, direct AI assistant. Answer like a knowledgeable friend: confident, specific, no fluff.\n\n' +
  'HARD RULES (never break these):\n' +
  '1. NEVER say "visit ESPN", "check the website", "go to X for details", "see their site", or any variant. You ARE the answer. The user came to you so they don\'t have to look it up themselves.\n' +
  '2. When web_search results are in the context: pull out the specific facts (team names, scores, times, prices, etc.) and state them directly. If the page content has the data, quote it.\n' +
  '3. If search ran but the results only confirm the topic exists without specific data: say what you know, then give the source info, and note what\'s missing.\n' +
  '4. Never fabricate scores, fixture times, or prices. Make clear what is confirmed vs uncertain.\n' +
  '5. Format: tight and scannable. Bullets for lists, bold for key facts. No preamble, no sign-off.';

const WEB_SEARCH_TOOL: ToolSpec = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Search the web for real-time info: scores, prices, news, weather, or any "today/latest/current" fact.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
      },
      required: ['query'],
    },
  },
};

function toBackendMessages(history: AgentMessage[]): ChatMessage[] {
  return history
    .filter(m => !m.isError)
    .map(m => ({ role: m.isUser ? ('user' as const) : ('assistant' as const), content: m.text }));
}

const HISTORY_CHAR_LIMIT = 20000;

function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  let body = messages.filter(m => m.role !== 'system');
  const size = () => body.reduce((n, m) => n + (m.content?.length || 0), 0);
  while (body.length > 2 && size() > HISTORY_CHAR_LIMIT) body = body.slice(1);
  return body;
}

// ── Tool runners ─────────────────────────────────────────────────────────────

function datetimeBlock(): string {
  const now = new Date();
  const date = now.toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date}, ${time}`;
}

const SEARCH_RESULT_CAP = 3000;

async function runWebSearchTool(query: string, onStatus?: PrepareTurnOptions['onStatus']): Promise<ToolCall> {
  onStatus?.({ type: 'searching', query });

  const results = await webSearch(query);
  console.log('[Agent] web_search:', JSON.stringify(query), '->', results ? `${results.items.length} items, ${results.text.length}ch` : 'null');

  if (!results || results.items.length === 0) {
    return { tool: 'web_search', query, result: 'No results found.', found: false };
  }
  return { tool: 'web_search', query, result: results.text.slice(0, SEARCH_RESULT_CAP), found: true };
}

function runMemoryTool(userText: string, history: AgentMessage[], onStatus?: PrepareTurnOptions['onStatus']): ToolCall | null {
  const recentUser = [...history.filter(m => m.isUser).slice(-1).map(m => m.text), userText]
    .join(' ')
    .slice(0, 600);
  const facts = Memory.getRelevantFacts(recentUser);
  if (facts.length === 0) return null;

  onStatus?.({ type: 'recalling' });
  const formatted = facts.map(f => `• ${f.text}`).join('\n');
  return { tool: 'memory_recall', result: formatted, found: true };
}

// ── System prompt builder from local (non-tool-call) context ─────────────────

function buildSystem(memory: ToolCall | null, attachments: Attachment[]): string {
  let system = PERSONA;
  system += `\n\n## Current date and time\n${datetimeBlock()}`;

  if (attachments.length > 0) {
    system += buildAttachmentBlock(attachments);
  }
  if (memory) {
    system += `\n\n## What I remember about this user\n${memory.result}`;
  }
  return system;
}

// ── Main entry point ──────────────────────────────────────────────────────────
// Runs the real tool-call decision turn (non-streamed) against the backend,
// executes web_search if the model asked for it, and returns the final
// message array ready to be streamed for the user-facing answer.

export async function prepareTurn(opts: PrepareTurnOptions): Promise<PreparedTurn> {
  const { history, userText, webEnabled, attachments = [], onStatus } = opts;

  const memoryCall = runMemoryTool(userText, history, onStatus);
  const system = buildSystem(memoryCall, attachments);

  const historyMessages = trimHistory(toBackendMessages(history));
  const baseMessages: ChatMessage[] = [
    { role: 'system', content: system },
    ...historyMessages,
    { role: 'user', content: userText },
  ];

  const toolCalls: ToolCall[] = [];
  let finalMessages = baseMessages;

  if (webEnabled) {
    try {
      const decision = await chatComplete(baseMessages, {
        tools: [WEB_SEARCH_TOOL],
        maxTokens: 350,
        temperature: 0.2,
      });

      const call = decision.toolCalls?.[0];
      if (call?.function?.name === 'web_search') {
        const args = JSON.parse(call.function.arguments || '{}');
        const query = String(args?.query || userText).slice(0, 200);
        const searchResult = await runWebSearchTool(query, onStatus);
        toolCalls.push(searchResult);

        const searchSystem = searchResult.found
          ? `\n\n## WEB SEARCH RESULTS ("${searchResult.query}", fetched ${new Date().toISOString().slice(0, 10)})\n${searchResult.result}\n\nYou MUST use the above content to answer. Extract names, scores, times, prices directly from the text. NEVER tell the user to visit any website.`
          : `\n\n## Tool: web_search ("${searchResult.query}")\nSearch returned no usable results. Tell the user you searched but got nothing, in one sentence.`;

        finalMessages = [
          { role: 'system', content: system + searchSystem },
          ...historyMessages,
          { role: 'user', content: userText },
        ];
      }
    } catch (e) {
      console.warn('[Agent] tool-call decision failed, answering without search:', e);
    }
  }

  if (memoryCall) toolCalls.push(memoryCall);

  console.log(`[Agent] messages=${finalMessages.length} tools=[${toolCalls.map(t => t.tool).join(', ')}]`);

  return { messages: finalMessages, toolCalls };
}

// ── Streaming ──────────────────────────────────────────────────────────────

export interface StreamTurnOptions {
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  onToken: (accumulated: string) => void;
  onReady?: (cancel: () => void) => void;
}

export interface StreamTurnResult {
  text: string;
  // Not reported by the backend today (would need stream_options.include_usage
  // relayed through) — kept optional so the UI's tok/s badge just hides itself.
  tokensPerSecond?: number;
  totalTokens?: number;
}

export async function streamTurn(opts: StreamTurnOptions): Promise<StreamTurnResult> {
  const controller = new AbortController();
  opts.onReady?.(() => controller.abort());

  console.log(`[Agent] chatStream START messages=${opts.messages.length} maxTok=${opts.maxTokens} temp=${opts.temperature}`);
  const result = await chatStream(opts.messages, {
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
    onToken: opts.onToken,
    signal: controller.signal,
  });
  console.log(`[Agent] chatStream DONE len=${result.text.length}`);
  return { text: result.text };
}

// ── Background learning ───────────────────────────────────────────────────────

let brainBusy = false;

export async function learnInBackground(
  userText: string,
  assistantText: string,
  onUpdate?: (info: { added: string[]; dreamed: boolean }) => void,
): Promise<void> {
  if (brainBusy) return;
  brainBusy = true;
  try {
    const added = await Memory.learnFromExchange(userText, assistantText);
    let dreamed = false;
    if (Memory.shouldDream()) {
      await Memory.dream();
      dreamed = true;
    }
    if (added.length || dreamed) onUpdate?.({ added: added.map(f => f.text), dreamed });
  } catch {
    /* never crash the app */
  } finally {
    brainBusy = false;
  }
}
