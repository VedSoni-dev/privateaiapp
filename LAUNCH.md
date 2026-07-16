# Private AI — 2-Day Public Launch Runbook

The code side of IAP, entitlements, and the share loop is DONE (see
"Already wired" below). What remains is account setup only you can do
(Apple + RevenueCat logins), config paste-ins, and the build/submit cycle.
Work top to bottom; items marked **⏰ SLOW** have external review/processing
time — start them first.

## Already wired in code (nothing to do here)

- `PurchaseService.ts` — RevenueCat wrapper, lazy-required (Expo Go-safe),
  identifies the user to RevenueCat as this install's device id.
- `server/index.js` — `POST /v1/rc-webhook`: RevenueCat calls it on every
  purchase/renewal/expiration and the server flips `ent:{deviceId}` in Redis.
  This is real receipt-validated Pro; `ALLOW_CLIENT_PRO` is obsolete.
- Paywall — price display, Restore Purchases, Terms + Privacy links
  (App Store guideline 3.1.2), cancel disclosure.
- Share loop — branded share-card images + one-time first-answer nudge;
  card footer turns into an App Store link via one constant (step 8).
- Content moderation / App Review guideline 1.2: long-press an AI response →
  "Report" opens a prefilled report on the public issue tracker (`legal.ts`).
  `TERMS.md` (acceptable use + reporting + subscription terms) is linked in
  onboarding before first use and in the paywall alongside `PRIVACY.md`.
- Usage gating — 20 free messages/day counted server-side, atomic, refunded
  on upstream failure.

## Day 1 — accounts, products, config

### 1. App Store Connect: agreements first ⏰ SLOW
- appstoreconnect.apple.com → Business (Agreements, Tax, Banking).
- Accept the **Paid Applications** agreement and complete banking + tax.
  Without this, subscriptions cannot be sold and Apple review will reject
  the IAP. Processing can take hours–days, so do this before anything else.

### 2. App Store Connect: app record
- My Apps → "+" → New App: platform iOS, bundle ID `inc.neocast.privateai`
  (must match `app.json`), name "Private AI" (have 2–3 fallback names ready;
  names are first-come-first-served), SKU anything (e.g. `privateai-001`).
- Note the **Apple ID** number on the App Information page — it gives you the
  store URL immediately, before approval:
  `https://apps.apple.com/app/id<APPLE_ID>` → used in step 8.

### 3. App Store Connect: subscription product
- App → Monetization → Subscriptions → create group `Pro`.
- Add auto-renewable subscription: reference name `Pro Monthly`, product ID
  **`pro_monthly`**, 1 month, $19.99 (or your price — the paywall fetches the
  localized price from StoreKit at display time and only falls back to a
  hardcoded "$19.99" in Expo Go, so no code change needed).
- Add the localization (display name "Pro", description "Unlimited messages").
- The review screenshot for the subscription can be added Day 2 (any paywall
  screenshot from the TestFlight build works).

### 4. RevenueCat project
- app.revenuecat.com → create project "Private AI" → add Apple App Store app
  with bundle ID `inc.neocast.privateai`.
- Connect App Store Connect: RevenueCat asks for an **App Store Connect API
  key (In-App Purchase key)** — generate it in ASC → Users and Access →
  Integrations, upload to RevenueCat.
- Entitlements → create **`pro`** (must be exactly this string —
  `ENTITLEMENT_ID` in `PurchaseService.ts`).
- Products → import `pro_monthly` → attach it to the `pro` entitlement.
- Offerings → make sure the default offering contains `pro_monthly`
  (the paywall buys `offerings.current.availablePackages[0]`).

### 5. Paste the API key
- RevenueCat → Project settings → API keys → copy the **Apple public key**
  (`appl_...`).
- Paste it into `REVENUECAT_IOS_KEY` in `src/services/PurchaseService.ts`.
  It's a public key; committing it is fine.

### 6. Webhook (server-side Pro validation)
- Generate a long random secret, e.g. in any terminal:
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Render dashboard → private-ai-backend → Environment → add
  `RC_WEBHOOK_AUTH=<that secret>` → save (triggers redeploy).
- RevenueCat → Project → Integrations → Webhooks → add:
  - URL: `https://private-ai-backend.onrender.com/v1/rc-webhook`
  - Authorization header value: the same secret.
- Click "Send test event" in RevenueCat → Render logs should show
  `[rc-webhook] TEST: applied 0 update(s)`. (0 is correct — TEST changes no
  entitlement.)

### 7. Render production env sanity check
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` **must be set** —
  without Redis, entitlements and usage live in instance memory and vanish
  on every deploy. `GET /health` should report `"usageStore": "upstash"`.
- **Delete `ALLOW_CLIENT_PRO`** (or set `false`). The webhook replaces it;
  leaving it on lets any client grant itself Pro.
- Confirm `PRIVATEMODE_API_KEY` is set (it is, if the backend is up).
- Leave the worker's `SEARCH_TOKEN` **unset** for now (see CLAUDE.md gotcha).

### 8. Flip the share-card funnel + version
- `src/components/ShareCardModal.tsx` → set
  `APP_STORE_URL = 'https://apps.apple.com/app/id<APPLE_ID>'` (from step 2).
- `app.json` → bump `version` if desired for the launch build.

### 9. Build + TestFlight ⏰ SLOW (build ~20 min, processing ~30 min)
```bash
npx eas build --platform ios --profile production
npx eas submit --platform ios
```
- In ASC → TestFlight → add yourself as internal tester → install.

### 10. Verify the money path on the TestFlight build
Sandbox purchases are automatic in TestFlight — you won't be charged.
1. Burn a few messages, tap Upgrade, complete the purchase.
2. App should show "✦ Pro · Unlimited" (local activation via RevenueCat SDK).
3. Render logs: `[rc-webhook] INITIAL_PURCHASE: applied 1 update(s)`.
4. Kill + reopen the app → still Pro (now served by the server's `ent:` key).
5. Settings → paywall → Restore Purchases → should succeed.
6. Also sanity-check: share card renders + shares, first-answer nudge fires
   on a fresh install, dark mode, chat history, web search.
7. **⚠️ Highest first-submission crash risk: Live Activities.** This is the
   FIRST time `expo-live-activity` (deprecated upstream) runs on a real
   device — it's never been verified. Send a message, background the app
   mid-answer, check the Dynamic Island / lock screen shows and completes
   correctly. Do this several times. Every call site is wrapped in try/catch
   (see `LiveActivityService.ts`), which stops a JS-level failure from
   crashing the app, but a hard native-side crash in the deprecated package
   itself would NOT be caught by that and WILL cause a rejection or removal
   under guideline 2.1 if App Review hits it. If you see ANY crash, freeze,
   or visual corruption here, stop and tell me before submitting — cutting
   a build with Live Activities disabled is fast; a rejection costs days.

## Day 2 — store listing + submit

### 11. Privacy nutrition labels (ASC → App Privacy)
Match PRIVACY.md honestly. With the current architecture:
- **Data collected**: Identifiers → Device ID (app functionality only, not
  linked to identity, not used for tracking) — this is the random install id
  used for quota. User Content (chats) is processed for app functionality
  but **not stored** by you beyond inference — declare "Other User Content"
  collected for App Functionality, not linked, not tracking, since messages
  transit your server.
- **No tracking**, no third-party advertising. RevenueCat processes purchase
  history (Purchases → App Functionality, not linked once you keep
  anonymous device ids).
- "Confidential compute / private" claims in marketing must stay consistent
  with these labels — reviewers check.

### 12. Store listing
- Screenshots: 6.9" (iPhone 16 Pro Max) + 6.5" sets — chat with a great
  answer, the share card, dark mode, memory screen, paywall. Take them in
  the TestFlight build.
- Description: lead with privacy ("Your conversations never train anyone's
  model"), then capability. Keywords: private ai, chatgpt alternative,
  confidential, encrypted chat, ai assistant.
- Support URL + marketing URL (GitHub page works), Privacy Policy URL:
  the PRIVACY.md link already used in the paywall.
- Age rating questionnaire (AI chat → typically 12+/17+ depending on answers;
  answer the "unrestricted web access" question **No** — search results are
  server-curated, the app has no browser).

### 13. Submit for review ⏰ SLOW (typically 24–48 h)
- Attach the `pro_monthly` subscription to the version (first subscription
  MUST be submitted together with an app version).
- Add the subscription review screenshot (paywall screenshot).
- App Review notes: "Free tier: 20 messages/day, no account needed. Pro
  ($19.99/mo auto-renewing via StoreKit/RevenueCat) removes the cap. AI
  responses come from a confidential-compute backend; web search is
  server-proxied. No login required — reviewers can use it immediately."
- Select "Release this version automatically" if you want it live the moment
  review passes.

### 14. Post-approval (5 minutes, day of launch)
- Confirm the App Store URL from step 8 resolves; if you skipped step 8
  pre-build, set it now and ship an OTA-safe follow-up build later — the
  card still works, it just says "Private AI for iPhone" instead of a link.
- Watch Render logs + Upstash dashboard for the first organic purchases
  (`[rc-webhook] INITIAL_PURCHASE`).
- Keep `ALLOW_CLIENT_PRO` off. Forever.

## Deliberately NOT in the launch (fine to ship without)
- Sentry crash reporting (needs a DSN; add in week 1).
- App Attest / DeviceCheck quota hardening (quota is advisory; acceptable
  at launch scale).
- Live Activities polish — code ships but is unverified on-device; it
  degrades silently if the module misbehaves.
- Worker `SEARCH_TOKEN` — enable only after launch builds dominate installs.
