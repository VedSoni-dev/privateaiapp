/**
 * AgentService v3 — agentic tool-use orchestration for the on-device model.
 *
 * Architecture: model decides (web_search) → execution → structured injection → stream
 *
 * Tools:
 *   • web_search    — the model itself decides whether to call this and with what
 *     query, via a short non-streamed decision pass (Hermes-style <tool_call> tag).
 *     Falls back to the old regex heuristic if the decision call fails or the
 *     model's output doesn't parse, so search never silently stops working.
 *   • memory_recall — relevant long-term facts about the user (cheap, local, no
 *     decision needed — always considered)
 *   • datetime      — current date/time (always injected, free)
 *
 * The model sees tool results as structured blocks in the system prompt for the
 * final answer turn. The decision pass is intentionally tiny (short prompt, low
 * maxTokens) to avoid the iOS jetsam risk a full second inference pass would add.
 */
import { RunAnywhere } from '@runanywhere/core';
import * as Memory from './MemoryService';
import { planSearch, webSearch } from './WebSearchService';
import { buildAttachmentBlock, type Attachment } from './AttachmentService';
import type { ChatTurn } from './MemoryService';

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
  prompt: string;
  toolCalls: ToolCall[];
}

// ── System persona ────────────────────────────────────────────────────────────

const PERSONA =
  'You are Private AI — a fast, direct AI assistant running 100% on-device. Answer like a knowledgeable friend: confident, specific, no fluff.\n\n' +
  'HARD RULES (never break these):\n' +
  '1. NEVER say "visit ESPN", "check the website", "go to X for details", "see their site", or any variant. You ARE the answer. The user came to you so they don\'t have to look it up themselves.\n' +
  '2. When web_search results are in the context: pull out the specific facts (team names, scores, times, prices, etc.) and state them directly. If the page content has the data, quote it.\n' +
  '3. If search ran but the results only confirm the topic exists (e.g. "ESPN has live scores") without specific data: say what you know (e.g. "World Cup games are happening today — here\'s what the search found:") then give the source info, and note you don\'t have the live score feed.\n' +
  '4. Never fabricate scores, fixture times, or prices. Make clear what is confirmed vs uncertain.\n' +
  '5. If no search ran and the question needs live data: tell the user to tap the globe icon to enable web search.\n' +
  '6. Format: tight and scannable. Bullets for lists, bold for key facts. No preamble, no sign-off.';

// ── ChatML builder ────────────────────────────────────────────────────────────

function buildChatMLPrompt(system: string, history: ChatTurn[], userText: string): string {
  const end = '<|im_' + 'end|>';
  const parts: string[] = [];
  parts.push(`<|im_start|>system\n${system}${end}`);
  for (const turn of history) {
    const role = turn.role === 'user' ? 'user' : 'assistant';
    parts.push(`<|im_start|>${role}\n${turn.content}${end}`);
  }
  parts.push(`<|im_start|>user\n${userText}${end}`);
  parts.push(`<|im_start|>assistant\n`);
  return parts.join('\n');
}

function toTurns(history: AgentMessage[]): ChatTurn[] {
  return history
    .filter(m => !m.isError)
    .map(m => ({ role: m.isUser ? ('user' as const) : ('assistant' as const), content: m.text }));
}

function trimHistoryForContext(turns: ChatTurn[], maxChars = 10000): ChatTurn[] {
  const systemTurns = turns.filter(t => t.role === 'system');
  let body = turns.filter(t => t.role !== 'system');
  const size = () => [...systemTurns, ...body].reduce((n, m) => n + (m.content?.length || 0), 0);
  while (body.length > 2 && size() > maxChars) body = body.slice(1);
  return [...systemTurns, ...body];
}

// Qwen 3B on iPhone jetsams above ~10–12K chars when search context is injected.
const PROMPT_HARD_CAP = 10000;
const SEARCH_RESULT_CAP = 1800;

function capPromptLength(prompt: string): string {
  if (prompt.length <= PROMPT_HARD_CAP) return prompt;
  console.warn(`[Agent] prompt capped ${prompt.length} -> ${PROMPT_HARD_CAP}`);
  return prompt.slice(0, PROMPT_HARD_CAP);
}

// ── Tool runners ─────────────────────────────────────────────────────────────

async function runDatetimeTool(): Promise<ToolCall> {
  const now = new Date();
  const date = now.toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return {
    tool: 'datetime',
    result: `${date}, ${time}`,
    found: true,
  };
}

// ── Tool-call decision pass ──────────────────────────────────────────────────
// A short, non-streamed generate() call where the model decides whether it
// needs web_search and with what query. Kept deliberately tiny (prompt + token
// budget) so it doesn't reintroduce the jetsam risk the old single-pass design
// avoided. Qwen3's instruct format understands Hermes-style <tool_call> tags.

const TOOL_SPEC =
  'You can call one tool: web_search, for real-time info (scores, prices, news, weather, "today/latest/current" facts).\n' +
  'If you need it, reply with EXACTLY this and nothing else:\n' +
  '<tool_call>\n{"name": "web_search", "arguments": {"query": "<search query>"}}\n</tool_call>\n' +
  'If you do NOT need it, reply with EXACTLY: NONE';

const TOOL_CALL_RE = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/i;

function buildDecisionPrompt(userText: string, history: AgentMessage[]): string {
  const lastTurn = [...history].reverse().find(m => !m.isError);
  const end = '<|im_' + 'end|>';
  const parts = [`<|im_start|>system\n${TOOL_SPEC}${end}`];
  if (lastTurn) {
    const role = lastTurn.isUser ? 'user' : 'assistant';
    parts.push(`<|im_start|>${role}\n${lastTurn.text.slice(0, 400)}${end}`);
  }
  parts.push(`<|im_start|>user\n${userText.slice(0, 400)}${end}`);
  parts.push('<|im_start|>assistant\n');
  return parts.join('\n');
}

async function decideWebSearchQuery(userText: string, history: AgentMessage[]): Promise<string | null> {
  try {
    const prompt = buildDecisionPrompt(userText, history);
    // Native generate()/generateStream() must never overlap (iOS crash) — share the lock.
    const result = await withInferenceLock(() =>
      RunAnywhere.generate(prompt, { maxTokens: 80, temperature: 0.1 }),
    );
    const text = (result.text || '').trim();

    const match = text.match(TOOL_CALL_RE);
    if (match) {
      const parsed = JSON.parse(match[1]);
      const query = parsed?.arguments?.query;
      if (typeof query === 'string' && query.trim()) {
        console.log('[Agent] tool-call decision: web_search ->', query);
        return query.trim().slice(0, 200);
      }
    }
    if (/^NONE\b/i.test(text)) {
      console.log('[Agent] tool-call decision: NONE');
      return null;
    }
    // Model didn't follow the format — fall back to the regex heuristic.
    console.warn('[Agent] tool-call decision unparseable, falling back to heuristic:', JSON.stringify(text.slice(0, 120)));
    return await planSearch(userText);
  } catch (e) {
    console.warn('[Agent] tool-call decision pass failed, falling back to heuristic:', e);
    return await planSearch(userText);
  }
}

async function runWebSearchTool(userText: string, history: AgentMessage[], onStatus?: PrepareTurnOptions['onStatus']): Promise<ToolCall | null> {
  const query = await decideWebSearchQuery(userText, history);
  if (!query) return null;

  onStatus?.({ type: 'searching', query });

  const results = await webSearch(query);
  console.log('[Agent] web_search:', JSON.stringify(query), '->', results ? `${results.items.length} items, ${results.text.length}ch` : 'null');

  if (!results || results.items.length === 0) {
    return { tool: 'web_search', query, result: 'No results found.', found: false };
  }

  return { tool: 'web_search', query, result: results.text.slice(0, SEARCH_RESULT_CAP), found: true };
}

async function runMemoryTool(userText: string, history: AgentMessage[], onStatus?: PrepareTurnOptions['onStatus']): Promise<ToolCall | null> {
  const recentUser = [...history.filter(m => m.isUser).slice(-1).map(m => m.text), userText]
    .join(' ')
    .slice(0, 600);
  const facts = Memory.getRelevantFacts(recentUser);
  if (facts.length === 0) return null;

  onStatus?.({ type: 'recalling' });

  const formatted = facts.map(f => `• ${f.text}`).join('\n');
  return { tool: 'memory_recall', result: formatted, found: true };
}

// ── System prompt builder from tool results ───────────────────────────────────

function buildSystemFromTools(toolCalls: ToolCall[], attachments: Attachment[]): string {
  let system = PERSONA;

  // Attachments (on-device files)
  if (attachments.length > 0) {
    system += buildAttachmentBlock(attachments);
  }

  // Tool results as structured blocks
  for (const tc of toolCalls) {
    if (tc.tool === 'datetime') {
      system += `\n\n## Tool: datetime\nCurrent date and time: ${tc.result}\nUse this when the user asks about the date, day, or time.`;
    } else if (tc.tool === 'web_search') {
      if (tc.found) {
        const today = new Date().toISOString().slice(0, 10);
        system += `\n\n## WEB SEARCH RESULTS ("${tc.query}", fetched ${today})\n${tc.result}\n\nYou MUST use the above content to answer. Extract names, scores, times, prices directly from the text. NEVER tell the user to visit any website. If the content is partial, state what you found and what's missing — don't redirect.`;
      } else {
        system += `\n\n## Tool: web_search ("${tc.query}")\nSearch returned no usable results. Tell the user you searched but got nothing, in one sentence.`;
      }
    } else if (tc.tool === 'memory_recall') {
      system += `\n\n## Tool: memory_recall\nWhat I remember about this user:\n${tc.result}`;
    }
  }

  return system;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function prepareTurn(opts: PrepareTurnOptions): Promise<PreparedTurn> {
  const { history, userText, webEnabled, attachments = [], onStatus } = opts;

  // Run tools in parallel (datetime always, others conditionally)
  const toolPromises: Promise<ToolCall | null>[] = [
    runDatetimeTool(),
    runMemoryTool(userText, history, onStatus),
    webEnabled ? runWebSearchTool(userText, history, onStatus) : Promise.resolve(null),
  ];

  const results = await Promise.all(toolPromises);
  const toolCalls = results.filter((r): r is ToolCall => r !== null);

  const hasSearch = toolCalls.some(t => t.tool === 'web_search');
  const system = buildSystemFromTools(toolCalls, attachments);

  let turns: ChatTurn[] = [{ role: 'system', content: system }, ...toTurns(history)];
  const before = turns.reduce((n, m) => n + (m.content?.length || 0), 0);
  turns = trimHistoryForContext(turns, hasSearch ? 5000 : 9000);
  if (turns.reduce((n, m) => n + (m.content?.length || 0), 0) < before) {
    onStatus?.({ type: 'compacting' });
  }

  const systemText = turns.filter(t => t.role === 'system').map(t => t.content).join('\n\n');
  const historyTurns = turns.filter(t => t.role !== 'system');
  const prompt = capPromptLength(buildChatMLPrompt(systemText, historyTurns, userText));

  console.log(`[Agent] prompt=${prompt.length}ch tools=[${toolCalls.map(t => t.tool).join(', ')}]`);

  return { prompt, toolCalls };
}

// ── Inference lock ────────────────────────────────────────────────────────────
// iOS crashes if generate() and generateStream() overlap in the native layer.

let inferenceBusy = false;

export function isInferenceBusy(): boolean {
  return inferenceBusy;
}

export async function withInferenceLock<T>(fn: () => Promise<T>): Promise<T> {
  while (inferenceBusy) {
    await new Promise(r => setTimeout(r, 120));
  }
  inferenceBusy = true;
  try {
    return await fn();
  } finally {
    inferenceBusy = false;
  }
}

export interface StreamTurnOptions {
  prompt: string;
  maxTokens: number;
  temperature: number;
  onToken: (accumulated: string) => void;
  onReady?: (cancel: () => void) => void;
}

export interface StreamTurnResult {
  text: string;
  tokensPerSecond?: number;
  totalTokens?: number;
}

/** Run one streaming inference turn — lock held until the stream fully completes. */
export async function streamTurn(opts: StreamTurnOptions): Promise<StreamTurnResult> {
  return withInferenceLock(async () => {
    console.log(
      `[Agent] generateStream START prompt=${opts.prompt.length}ch maxTok=${opts.maxTokens} temp=${opts.temperature}`,
    );
    const streamResult = await RunAnywhere.generateStream(opts.prompt, {
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
    });
    opts.onReady?.(streamResult.cancel);
    let text = '';
    let gotToken = false;
    for await (const token of streamResult.stream) {
      if (!gotToken) {
        console.log('[Agent] generateStream FIRST_TOKEN');
        gotToken = true;
      }
      text += token;
      opts.onToken(text);
    }
    const final = await streamResult.result;
    console.log(
      `[Agent] generateStream DONE tokens=${final.tokensUsed} tps=${final.tokensPerSecond?.toFixed(1)}`,
    );
    return {
      text,
      tokensPerSecond: final.tokensPerSecond,
      totalTokens: final.tokensUsed,
    };
  });
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
    // Wait for the main stream to fully release native inference before learning.
    await new Promise(r => setTimeout(r, 800));
    await withInferenceLock(async () => {
      const added = await Memory.learnFromExchange(userText, assistantText);
      let dreamed = false;
      if (Memory.shouldDream()) {
        await Memory.dream();
        dreamed = true;
      }
      if (added.length || dreamed) onUpdate?.({ added: added.map(f => f.text), dreamed });
    });
  } catch {
    /* never crash the app */
  } finally {
    brainBusy = false;
  }
}
