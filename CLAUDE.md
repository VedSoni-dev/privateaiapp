# Private AI — Agent Runbook

ChatGPT-style iOS app with confidential-compute cloud inference. Managed Expo
app (runs in Expo Go for dev), shipped via EAS to TestFlight.

**Hard constraint: everything in `src/` must stay Expo Go-compatible.** No
native modules outside the Expo SDK. If a task requires one (e.g. StoreKit /
`react-native-purchases`), flag it — it forces a dev-client build and is the
user's decision.

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
subscription cancel disclosure (PaywallModal).

Open, in priority order:
1. **Real IAP**: RevenueCat + App Store Connect subscription product + server
   receipt validation replacing `ALLOW_CLIENT_PRO`. Blocks charging money.
   Paywall also still needs a **Restore Purchases** button and Terms/Privacy
   links (App Store guideline 3.1.2 — rejection risk).
2. Privacy policy URL + privacy nutrition labels in App Store Connect.
3. Crash reporting (`sentry-expo`) — needs a DSN from the user.
4. App Attest / DeviceCheck to make device quotas non-spoofable.
5. Real tests (jest isn't installed despite the `test` script).

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
