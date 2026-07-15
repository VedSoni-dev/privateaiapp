/**
 * logic.js — pure, side-effect-free business logic extracted from index.js
 * so it can actually be unit tested. index.js spawns a subprocess and starts
 * a listener at import time, so nothing in it can be imported directly in a
 * test without those side effects firing.
 *
 * Behavior is unchanged from the inline versions this replaced — this is a
 * pure extraction, not a rewrite. `now` is injectable (defaults to the real
 * clock) purely so date-boundary tests don't depend on when they happen to run.
 */

// The client date is only honored within +/- 1 day of server time (timezone
// tolerance). Anything further is a spoof attempt to reset the daily counter.
export function toDateKey(input, now = new Date()) {
  const serverDate = now.toISOString().slice(0, 10);
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return serverDate;
  const diffMs = Math.abs(new Date(`${input}T00:00:00Z`) - new Date(`${serverDate}T00:00:00Z`));
  return diffMs <= 26 * 60 * 60 * 1000 ? input : serverDate;
}

export function usageSummary(date, messages, isPro, limit, source = 'memory') {
  return {
    date,
    messages,
    isPro,
    limit,
    remaining: isPro ? null : Math.max(0, limit - messages),
    source,
  };
}

export function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function validateMessages(messages, limits) {
  const { maxMessages, maxMessageChars, maxTotalChars } = limits;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, error: 'messages array required' };
  }
  if (messages.length > maxMessages) {
    return { ok: false, error: `too many messages; max ${maxMessages}` };
  }

  let totalChars = 0;
  const cleaned = [];
  for (const message of messages) {
    const role = message?.role;
    const content = typeof message?.content === 'string' ? message.content : '';
    if (!['system', 'user', 'assistant', 'tool'].includes(role)) {
      return { ok: false, error: 'invalid message role' };
    }
    if (content.length > maxMessageChars) {
      return { ok: false, error: `message too long; max ${maxMessageChars} chars` };
    }
    totalChars += content.length;
    if (totalChars > maxTotalChars) {
      return { ok: false, error: `conversation too long; max ${maxTotalChars} chars` };
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

/**
 * RevenueCat webhook → entitlement decisions.
 *
 * The client configures RevenueCat with appUserID = the app's device id, so
 * webhook `app_user_id` values map 1:1 onto the server's `ent:{deviceId}`
 * keys. Anonymous ids ($RCAnonymousID:...) can still appear (e.g. events from
 * before the identified login) — resolve through `aliases` to a real id.
 */
function rcIsRealUserId(id) {
  return typeof id === 'string' && id.trim().length > 0 && !id.startsWith('$RCAnonymousID:');
}

export function rcResolveAppUserId(event) {
  if (rcIsRealUserId(event?.app_user_id)) return event.app_user_id.trim();
  const aliases = Array.isArray(event?.aliases) ? event.aliases : [];
  const real = aliases.find(rcIsRealUserId);
  return real ? real.trim() : null;
}

// Events that mean "this user is entitled right now". CANCELLATION is
// deliberately absent: it only means auto-renew was switched off — the user
// stays entitled until EXPIRATION arrives. BILLING_ISSUE likewise (Apple's
// grace period applies); TEST is RevenueCat's dashboard ping.
const RC_GRANT_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'SUBSCRIPTION_EXTENDED',
  'PRODUCT_CHANGE',
]);
const RC_REVOKE_EVENTS = new Set(['EXPIRATION']);

// Grace beyond the subscription's own expiry so one missed/late renewal
// webhook doesn't cut off a paying user — the renewal event re-sets the key.
const RC_GRACE_MS = 3 * 24 * 60 * 60 * 1000;
// When the event carries no usable expiry (e.g. TRANSFER), cover a monthly
// cycle plus grace; the next renewal webhook takes over from there.
const RC_DEFAULT_TTL_MS = 35 * 24 * 60 * 60 * 1000;

function rcTtlSeconds(event, now) {
  const expMs = Number(event?.expiration_at_ms);
  const remaining = Number.isFinite(expMs) && expMs > now.getTime()
    ? expMs - now.getTime()
    : RC_DEFAULT_TTL_MS;
  return Math.ceil((remaining + RC_GRACE_MS) / 1000);
}

/**
 * Returns the entitlement writes a webhook event implies:
 * [{ deviceId, isPro, ttlSeconds? }]. Empty array for events that change
 * nothing (CANCELLATION, BILLING_ISSUE, TEST, unknown types, anonymous-only
 * ids). Revokes are ordered before grants.
 */
export function rcEntitlementUpdates(event, now = new Date()) {
  if (!event || typeof event !== 'object') return [];
  const type = String(event.type || '');

  // A restore on a new device moves the subscription between app user ids.
  if (type === 'TRANSFER') {
    const from = (Array.isArray(event.transferred_from) ? event.transferred_from : []).filter(rcIsRealUserId);
    const to = (Array.isArray(event.transferred_to) ? event.transferred_to : []).filter(rcIsRealUserId);
    const ttlSeconds = rcTtlSeconds(event, now);
    return [
      ...from.map(id => ({ deviceId: id.trim(), isPro: false })),
      ...to.map(id => ({ deviceId: id.trim(), isPro: true, ttlSeconds })),
    ];
  }

  const grant = RC_GRANT_EVENTS.has(type);
  const revoke = RC_REVOKE_EVENTS.has(type);
  if (!grant && !revoke) return [];

  const deviceId = rcResolveAppUserId(event);
  if (!deviceId) return [];
  if (revoke) return [{ deviceId, isPro: false }];
  return [{ deviceId, isPro: true, ttlSeconds: rcTtlSeconds(event, now) }];
}

/**
 * In-memory (no-Redis) usage/calls tracking, extracted as functions over an
 * explicit Map rather than module-level state, so tests get an isolated
 * store instead of sharing one across test cases.
 */
export function memoryRecord(store, deviceId, dateKey, delta = 0, isPro) {
  const current = store.get(deviceId) || { date: dateKey, messages: 0, isPro: false };
  const next = {
    date: dateKey,
    messages: Math.max(0, current.date === dateKey ? current.messages + delta : delta),
    isPro: typeof isPro === 'boolean' ? isPro : current.isPro,
  };
  store.set(deviceId, next);
  return next;
}

export function memoryGet(store, deviceId, dateKey) {
  const current = store.get(deviceId) || { date: dateKey, messages: 0, isPro: false };
  const next = current.date === dateKey
    ? current
    : { date: dateKey, messages: 0, isPro: current.isPro };
  store.set(deviceId, next);
  return next;
}
