// Tests for the pure usage/entitlement/validation logic — the highest-value
// place to have real coverage, since this is what decides whether a message
// gets charged against someone's daily quota. Run with: node --test server/
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { toDateKey, usageSummary, clampNumber, validateMessages, memoryRecord, memoryGet } from './logic.js';

const NOW = new Date('2026-07-15T12:00:00Z');

describe('toDateKey', () => {
  test('falls back to server date when no input is given', () => {
    assert.equal(toDateKey(undefined, NOW), '2026-07-15');
  });

  test('falls back to server date for malformed input', () => {
    assert.equal(toDateKey('not-a-date', NOW), '2026-07-15');
    assert.equal(toDateKey(12345, NOW), '2026-07-15');
    assert.equal(toDateKey(null, NOW), '2026-07-15');
  });

  test('honors a client date within +/-1 day (timezone tolerance)', () => {
    assert.equal(toDateKey('2026-07-14', NOW), '2026-07-14');
    assert.equal(toDateKey('2026-07-16', NOW), '2026-07-16');
  });

  test('rejects a client date more than ~1 day off as a spoof attempt', () => {
    // The whole point of this check: resetting the counter by claiming
    // "yesterday" or "next week" must not work.
    assert.equal(toDateKey('2026-07-01', NOW), '2026-07-15');
    assert.equal(toDateKey('2026-08-01', NOW), '2026-07-15');
  });
});

describe('usageSummary', () => {
  test('computes remaining for a free user', () => {
    const s = usageSummary('2026-07-15', 5, false, 20);
    assert.equal(s.remaining, 15);
    assert.equal(s.limit, 20);
  });

  test('remaining floors at 0, never negative', () => {
    const s = usageSummary('2026-07-15', 25, false, 20);
    assert.equal(s.remaining, 0);
  });

  test('Pro users have no remaining cap (null)', () => {
    const s = usageSummary('2026-07-15', 999, true, 20);
    assert.equal(s.remaining, null);
  });

  test('defaults source to memory', () => {
    const s = usageSummary('2026-07-15', 0, false, 20);
    assert.equal(s.source, 'memory');
  });
});

describe('clampNumber', () => {
  test('passes a valid in-range value through unchanged', () => {
    assert.equal(clampNumber(0.7, 0.5, 0, 1.5), 0.7);
  });
  test('clamps below the minimum', () => {
    assert.equal(clampNumber(-5, 0.5, 0, 1.5), 0);
  });
  test('clamps above the maximum', () => {
    assert.equal(clampNumber(5000, 800, 1, 1800), 1800);
  });
  test('uses the fallback for non-numeric input', () => {
    assert.equal(clampNumber('not a number', 800, 1, 1800), 800);
    assert.equal(clampNumber(undefined, 800, 1, 1800), 800);
    assert.equal(clampNumber(NaN, 800, 1, 1800), 800);
  });
});

const LIMITS = { maxMessages: 40, maxMessageChars: 16_000, maxTotalChars: 80_000 };

describe('validateMessages', () => {
  test('rejects a missing/empty array', () => {
    assert.equal(validateMessages(undefined, LIMITS).ok, false);
    assert.equal(validateMessages([], LIMITS).ok, false);
  });

  test('rejects too many messages', () => {
    const messages = Array.from({ length: 41 }, () => ({ role: 'user', content: 'hi' }));
    const result = validateMessages(messages, LIMITS);
    assert.equal(result.ok, false);
    assert.match(result.error, /too many messages/);
  });

  test('rejects an invalid role', () => {
    const result = validateMessages([{ role: 'admin', content: 'hi' }], LIMITS);
    assert.equal(result.ok, false);
    assert.match(result.error, /invalid message role/);
  });

  test('rejects a single message over the per-message char cap', () => {
    const result = validateMessages([{ role: 'user', content: 'x'.repeat(16_001) }], LIMITS);
    assert.equal(result.ok, false);
    assert.match(result.error, /message too long/);
  });

  test('rejects a conversation over the total char cap even with individually-short messages', () => {
    const messages = Array.from({ length: 10 }, () => ({ role: 'user', content: 'x'.repeat(9_000) }));
    const result = validateMessages(messages, LIMITS);
    assert.equal(result.ok, false);
    assert.match(result.error, /conversation too long/);
  });

  test('accepts valid messages and preserves tool fields, strips unknown ones', () => {
    const result = validateMessages([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi', evil_field: 'should be dropped' },
      { role: 'assistant', content: '', tool_calls: [{ id: '1', type: 'function', function: { name: 'x', arguments: '{}' } }] },
      { role: 'tool', content: 'result', tool_call_id: '1' },
    ], LIMITS);
    assert.equal(result.ok, true);
    assert.equal(result.messages.length, 4);
    assert.equal(result.messages[1].evil_field, undefined);
    assert.deepEqual(result.messages[2].tool_calls, [{ id: '1', type: 'function', function: { name: 'x', arguments: '{}' } }]);
    assert.equal(result.messages[3].tool_call_id, '1');
  });

  test('treats a non-string content as empty rather than crashing', () => {
    const result = validateMessages([{ role: 'user', content: 42 }], LIMITS);
    assert.equal(result.ok, true);
    assert.equal(result.messages[0].content, '');
  });
});

describe('memoryRecord / memoryGet (in-memory usage store, no-Redis fallback)', () => {
  test('increments accumulate within the same day', () => {
    const store = new Map();
    memoryRecord(store, 'device-1', '2026-07-15', 1);
    memoryRecord(store, 'device-1', '2026-07-15', 1);
    const record = memoryRecord(store, 'device-1', '2026-07-15', 1);
    assert.equal(record.messages, 3);
  });

  test('a new day resets the counter to just this delta', () => {
    const store = new Map();
    memoryRecord(store, 'device-1', '2026-07-15', 5);
    const record = memoryRecord(store, 'device-1', '2026-07-16', 1);
    assert.equal(record.messages, 1);
    assert.equal(record.date, '2026-07-16');
  });

  test('decrementing floors at 0, never negative', () => {
    const store = new Map();
    memoryRecord(store, 'device-1', '2026-07-15', 1);
    const record = memoryRecord(store, 'device-1', '2026-07-15', -5);
    assert.equal(record.messages, 0);
  });

  test('isPro persists across a day rollover', () => {
    const store = new Map();
    memoryRecord(store, 'device-1', '2026-07-15', 1, true);
    const record = memoryRecord(store, 'device-1', '2026-07-16', 1);
    assert.equal(record.isPro, true);
  });

  test('memoryGet on a stale day returns a zeroed read without mutating messages retroactively', () => {
    const store = new Map();
    memoryRecord(store, 'device-1', '2026-07-15', 7);
    const record = memoryGet(store, 'device-1', '2026-07-16');
    assert.equal(record.messages, 0);
    assert.equal(record.date, '2026-07-16');
  });
});
