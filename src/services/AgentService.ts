/**
 * AgentService — orchestrates a single chat turn for the on-device model.
 *
 * Mirrors the desktop app's runChat pipeline, adapted to RunAnywhere's
 * single-prompt generate API:
 *   1. Time awareness  — always inject the current local date/time
 *   2. Web search       — opt-in; plan a query, fetch results, inject them
 *   3. Memory           — inject the most relevant remembered facts
 *   4. Compaction       — summarize older turns on very long chats
 *   5. (after the reply) learn durable facts in the background
 *
 * Inference stays on-device. Only the search query leaves the phone, and only
 * when the user has turned web search on.
 */
import * as Memory from './MemoryService';
import {
  planSearch,
  webSearch,
  buildSearchBlock,
  buildNoResultsBlock,
} from './WebSearchService';
import { buildAttachmentBlock, type Attachment } from './AttachmentService';
import type { ChatTurn } from './MemoryService';

export const BASE_SYSTEM_PROMPT =
  'You are Private AI, a helpful assistant running entirely on the user\'s phone. ' +
  'Be concise, friendly, and accurate. You have a private long-term memory of past ' +
  'chats and can look things up on the web when the user enables it. Never mention ' +
  'cloud services or external APIs for your thinking — all processing is local and private.\n\n' +
  'ACCURACY RULES (very important):\n' +
  '- Never invent facts. Do not make up current events, news, sports scores, fixtures, ' +
  'schedules, prices, standings, statistics, dates, or quotes.\n' +
  "- For anything that changes over time or that you're unsure about, only state it if it " +
  'appears in the provided web search results or your memory. Otherwise say you are not sure ' +
  'or suggest turning on web search.\n' +
  '- Only claim you searched the web if web search results are actually provided to you in this prompt.';

export interface AgentMessage {
  isUser: boolean;
  text: string;
  isError?: boolean;
}

export interface PrepareTurnOptions {
  history: AgentMessage[];
  userText: string;
  webEnabled: boolean;
  attachments?: Attachment[];
  onStatus?: (status: { type: 'searching' | 'compacting'; query?: string }) => void;
}

export interface PreparedTurn {
  prompt: string;
  searchedQuery: string | null;
}

/**
 * Builds a proper Qwen2.5 ChatML prompt. Using raw "User:/Assistant:" format
 * bypasses the model's chat template and significantly hurts response quality.
 *
 * Format:
 *   <|im_start|>system\n{system}<|im_end|>
 *   <|im_start|>user\n{msg}<|im_end|>
 *   <|im_start|>assistant\n{msg}<|im_end|>
 *   ...
 *   <|im_start|>user\n{current}<|im_end|>
 *   <|im_start|>assistant\n
 */
function buildChatMLPrompt(system: string, history: ChatTurn[], userText: string): string {
  const parts: string[] = [];
  parts.push(`<|im_start|>system\n${system}<|im_end|>`);
  for (const turn of history) {
    const role = turn.role === 'user' ? 'user' : 'assistant';
    parts.push(`<|im_start|>${role}\n${turn.content}<|im_end|>`);
  }
  parts.push(`<|im_start|>user\n${userText}<|im_end|>`);
  parts.push(`<|im_start|>assistant\n`);
  return parts.join('\n');
}

function timeBlock(): string {
  const now = new Date();
  const date = now.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const time = now.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `\n\nThe current date and time on the user's device is ${date}, ${time}. Use this when the user asks about the date, day, or time.`;
}

function toTurns(history: AgentMessage[]): ChatTurn[] {
  return history
    .filter(m => !m.isError)
    .map(m => ({
      role: m.isUser ? ('user' as const) : ('assistant' as const),
      content: m.text,
    }));
}

/**
 * Build the full prompt for this turn, running search/memory/compaction first.
 */
export async function prepareTurn(opts: PrepareTurnOptions): Promise<PreparedTurn> {
  const { history, userText, webEnabled, attachments, onStatus } = opts;

  // 1) System context starts with persona + live time.
  let system = BASE_SYSTEM_PROMPT + timeBlock();

  // Attached files (read on-device) become grounding context for this turn.
  if (attachments && attachments.length > 0) {
    system += buildAttachmentBlock(attachments);
  }

  // 2) Opt-in web search.
  let searchedQuery: string | null = null;
  if (webEnabled) {
    const query = await planSearch(userText);
    console.log('[Agent] webEnabled=true planSearch query =', JSON.stringify(query));
    if (query) {
      onStatus?.({ type: 'searching', query });
      const results = await webSearch(query);
      console.log(
        '[Agent] webSearch returned',
        results ? `${results.items.length} items` : 'NULL',
        results ? `\n--- results ---\n${results.text.slice(0, 600)}` : '',
      );
      if (results && results.items.length > 0) {
        system += buildSearchBlock(query, results.text);
        searchedQuery = query;
      } else {
        // Search was warranted but came back empty — explicitly tell the model
        // not to fabricate instead of letting it answer from thin air.
        system += buildNoResultsBlock(query);
      }
    }
  } else {
    console.log('[Agent] webEnabled=false (globe toggle off) — no search');
  }

  // 3) Relevant memories (also reinforces them).
  const recentUser = [...history.filter(m => m.isUser).slice(-1).map(m => m.text), userText]
    .join(' ')
    .slice(0, 600);
  const memBlock = Memory.buildMemoryBlock(recentUser);
  if (memBlock) system += memBlock;

  // 4) Compact long histories (keep recent turns verbatim).
  let turns: ChatTurn[] = [{ role: 'system', content: system }, ...toTurns(history)];
  const { messages: compacted, compacted: didCompact } = await Memory.compact(turns);
  if (didCompact) onStatus?.({ type: 'compacting' });
  turns = compacted;

  // Assemble using Qwen2.5's native ChatML format.
  // Using the raw `User:/Assistant:` format ignores the model's chat template
  // and significantly degrades output quality.
  const systemText = turns
    .filter(t => t.role === 'system')
    .map(t => t.content)
    .join('\n\n');
  const historyTurns = turns.filter(t => t.role !== 'system');

  const prompt = buildChatMLPrompt(systemText, historyTurns, userText);

  console.log(
    `[Agent] final prompt length=${prompt.length} chars, searched=${searchedQuery ?? 'no'}`,
  );
  console.log('[Agent] ---- PROMPT START ----\n' + prompt.slice(0, 1500) + '\n---- PROMPT END (truncated) ----');

  return { prompt, searchedQuery };
}

/**
 * Learn from a finished exchange without blocking the UI. Runs one extraction,
 * then occasionally "dreams" to consolidate. Guarded so it never overlaps with
 * itself or crashes the app.
 */
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
    if (added.length || dreamed) {
      onUpdate?.({ added: added.map(f => f.text), dreamed });
    }
  } catch {
    /* never let the brain crash the app */
  } finally {
    brainBusy = false;
  }
}
