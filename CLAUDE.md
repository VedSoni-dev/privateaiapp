# Private AI — Agent Runbook

ChatGPT-style iOS app with confidential-compute cloud inference. Managed Expo
app (runs in Expo Go for dev), shipped via EAS to TestFlight.

**Native-module policy (changed July 2026):** the app is migrating to an
expo-dev-client workflow, so native modules are allowed — but they MUST be
lazily `require()`d behind a graceful fallback (see `PurchaseService.ts`,
`copyMessageText`) so the JS bundle still runs in Expo Go for quick iteration.
Never import a non-Expo-SDK native module at the top level of a file that
Expo Go loads.

## Architecture

```
iPhone app (Expo, src/)
  ├─ /v1/chat, /v1/usage*  →  Render backend (server/index.js, Express)
  │                             └─ privatemode-proxy (confidential compute, gpt-oss-120b)
  │                             └─ Upstash Redis (usage counters; in-memory fallback)
  └─ /search               →  Cloudflare Worker (worker/src/index.ts)
                                └─ Brave Search API → DDG fallback → r.jina.ai page reads
```

- Backend URL: `https://private-ai-backend.onrender.com` (hardcoded in
  `src/services/BackendClient.ts` and `UsageService.ts`)
- Worker URL: `https://private-ai-search.vedantn06soni.workers.dev`
  (hardcoded in `src/services/WebSearchService.ts`)
- The app never holds the inference API key; only the backend does.

## Key source files

| Path | Role |
|---|---|
| `src/services/AgentService.ts` | Orchestrates a turn: decision pass (non-streaming) → optional web search → streaming answer |
| `src/services/BackendClient.ts` | Only file that talks to the backend. Streaming MUST use `expo/fetch` (RN fetch has no readable body) |
| `src/services/UsageService.ts` | Local usage cache + server sync. Server is source of truth |
| `src/services/WebSearchService.ts` | Search client + heuristics for when to search; sends `x-search-token` |
| `src/services/DeviceId.ts` | Random per-install ID; spoofable, quota is advisory until App Attest |
| `src/services/LiveActivityService.ts` | Dynamic Island / lock-screen progress for in-flight answers |
| `src/services/BackgroundExecutionService.ts` | Extends iOS's background-execution grace so streams survive backgrounding |
| `src/services/NotificationService.ts` | Local-only notifications (quota-reset reminder; generic scheduler for future nudges) |
| `src/services/CalendarService.ts` | Adds events via the OS's native "Add Event" dialog — write-only, never reads the calendar |
| `src/ShareExtension.tsx` | Share Extension UI (separate JS bundle, entry: `index.share.js`) — hands shared text to the main app via `privateai://share` |
| `server/index.js` | Express backend: rate limit, capacity guard, validation, usage gating/counting, SSE relay |
| `worker/src/index.ts` | Search Worker + cron keep-warm ping for Render free tier |

## Usage / entitlement model (money lives here — be careful)

- The **server** counts messages: each `stream: true` call to `/v1/chat`
  increments `usage:{deviceId}:{date}` (Redis INCR, atomic). Non-streaming
  calls (decision pass, memory extraction) only count toward a total-call
  backstop (`calls:{deviceId}:{date}`, cap `MAX_DAILY_CALLS` = 8× limit).
- Free limit: 20 messages/day (`FREE_DAILY_LIMIT`). Over limit → HTTP 402.
- Failed upstream requests are refunded (DECR).
- `POST /v1/usage/record` is a **read-only sync** kept for old shipped
  clients — it must never increment again (double-count).
- `POST /v1/usage/pro` is **disabled unless `ALLOW_CLIENT_PRO=true`** on
  Render. It trusts the client and exists only for TestFlight testing. It must
  be OFF in production; real Pro requires StoreKit receipt validation
  (RevenueCat planned, not yet implemented — no real IAP exists yet).
- Client dates (`x-client-date`) are only honored within ±1 day of server time.
- The usage gate **fails open** if Redis is down (deliberate UX tradeoff).

## Env vars

Render backend: `PRIVATEMODE_API_KEY` (required), `UPSTASH_REDIS_REST_URL`,
`UPSTASH_REDIS_REST_TOKEN` (without these usage falls back to per-instance
memory — set them in production), `ALLOW_CLIENT_PRO` (TestFlight only),
`FREE_DAILY_LIMIT`, `MAX_DAILY_CALLS`, `RATE_LIMIT_MAX`, `MAX_TOKENS`, etc.
(see top of `server/index.js`).

Worker: `BRAVE_KEY` (secret), `SEARCH_TOKEN` (secret; when set, `/search`
requires the matching `x-search-token` header — the constant in
`WebSearchService.ts`. Only set it after builds without the header age out,
or search silently breaks for them).

## Commands

```bash
npm start                 # Expo dev server (Expo Go)
npx tsc --noEmit          # typecheck — run after any src/ change
npm run lint
npm run test:api          # backend smoke test (scripts/test-api.mjs)

# Backend: deploys automatically when the branch on Render is pushed (Render dashboard)
# Worker:
cd worker && npx wrangler deploy
npx wrangler secret put SEARCH_TOKEN   # enable search auth (see caveat above)

# iOS release:
npx eas build --platform ios --profile production
npx eas submit --platform ios
```

## Production status / open items

Done: server-side usage counting, worker auth (code-ready, secret not set),
rate limiting + capacity guard + input validation, accessibility labels +
44pt targets + AA contrast, FTC AI disclosure (ChatScreen input area) and
subscription cancel disclosure (PaywallModal), Dynamic Island Live Activity
+ background-execution grace, Share Extension (share text/a URL into the
app from anywhere, e.g. selected Messages text), local notifications
(quota-reset reminder), calendar event creation from any message.

Open, in priority order:
1. **Real IAP — code is wired, config is not**: `PurchaseService.ts` wraps
   RevenueCat (lazy-required, Expo Go-safe) and the paywall has Restore +
   Terms/Privacy links. Still needed from the user: App Store Connect
   subscription product, RevenueCat project, paste the `appl_` key into
   `PurchaseService.ts`, then a dev-client/TestFlight build. Server-side
   receipt validation (RevenueCat webhook → set `ent:` in Redis) should then
   replace `ALLOW_CLIENT_PRO`.
2. Privacy nutrition labels in App Store Connect (policy exists: PRIVACY.md,
   linked from the paywall).
3. Live Activities / Dynamic Island — CODE DONE, unverified until the first
   dev-client build: `LiveActivityService.ts` (lazy-required) wraps the
   deprecated-but-functional `expo-live-activity` 0.4.2 (last version that
   supports SDK 54). On the next SDK upgrade (55+), swap it for the official
   `expo-widgets`. Started on send, completed/errored with the stream.
4. Crash reporting (`sentry-expo`) — needs a DSN from the user.
5. App Attest / DeviceCheck to make device quotas non-spoofable.
6. Real tests (jest isn't installed despite the `test` script).

## Gotchas

- Streaming: `expo/fetch` only. RN's fetch silently lacks `res.body`.
- Render free tier sleeps; the Worker cron pings `/health` to keep it warm.
  A deploy wipes in-memory usage/rate-limit state (Redis path unaffected).
- `AppColors.accentCyan` is actually crimson (#8f1d31) — the semantic token
  names survived the palette change; don't "fix" them mechanically.
- `textMuted` was darkened for WCAG AA (4.5:1) — check contrast before
  lightening any text color on the cream background.
- Old TestFlight builds still call `/v1/usage/record` and don't send
  `x-search-token`; keep both compatible until those builds are gone.
- `expo-share-extension`'s `openHostApp(path)` opens the app's own configured
  `scheme` (`privateai://`), not a fixed library scheme — confirmed from the
  library's own example app.json, not documented in its README. The query
  key used when calling `openHostApp` must exactly match the `parse` key in
  App.tsx's `linking.config.screens.Chat` (currently `sharedText`).
- EAS free tier is 15 builds/month; only native-dependency or native-config
  changes cost a build. Batch multiple native additions into one build
  rather than one-at-a-time — see git history around Notifications/Calendar/
  Share Extension landing together.
- iOS extension sandboxing is absolute: no iMessage extension, custom
  keyboard, or Share Extension can read another app's data (e.g. Messages
  thread history) — only what the user explicitly selects/shares. Don't
  propose "read the conversation" features; the Share Extension covers the
  legitimate version of that ask.
