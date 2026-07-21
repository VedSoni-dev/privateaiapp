# Private AI — Launch runbook (native SwiftUI)

Work top → bottom on your **Mac**. Code is largely ready; remaining work is
**accounts you own** (Apple, RevenueCat, Render) + Archive/TestFlight.

**Live check (2026-07-21):** `GET /v1/usage` already returns `"limit":10`.
Keep `FREE_DAILY_LIMIT=10` pinned in Render (also in `render.yaml`).

## Already wired in the native app

- Bundle ID `inc.neocast.privateai` · App Store id `6785089361`
- StoreKit / RevenueCat Pro (`pro_monthly` / entitlement `pro`)
- Server webhook `POST /v1/rc-webhook` + Upstash usage/entitlements
- Paywall: price, Restore, Terms + Privacy links
- Share cards, Share Extension, Live Activities, Home widget, iMessage app
- Report-on-answer, onboarding legal links, in-app **How privacy works**
- Free tier **10**/day (client + server default)

## Day 0 — one-time Mac setup

```bash
brew install xcodegen
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
cd ~/PrivateAIApp
xcodegen generate
open PrivateAI.xcodeproj
```

Xcode → Signing & Capabilities → Team for **Private AI**, Widget, Share, Messages.

## Day 1 — money path (do slow items first)

### 1. ASC Paid Apps agreement ⏰
appstoreconnect.apple.com → Business → accept **Paid Applications**, banking + tax.

### 2. Subscription product
Monetization → Subscriptions → group `Pro` → product id **`pro_monthly`**,
monthly, localization “Pro / Unlimited messages”. Attach to the app version later.

### 3. RevenueCat
- Apple app with bundle `inc.neocast.privateai`
- Entitlement **`pro`**, product `pro_monthly`, default offering
- Confirm public Apple key in `PrivateAI/Services/PurchaseStore.swift` (`appl_…`)

### 4. Render webhook + env
Dashboard → `private-ai-backend` → Environment:

| Key | Value |
|-----|--------|
| `FREE_DAILY_LIMIT` | `10` |
| `RC_WEBHOOK_AUTH` | long random secret |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | required |
| `PRIVATEMODE_API_KEY` | set |
| `ALLOW_CLIENT_PRO` | **delete / false** |

RevenueCat → Webhooks →  
`https://private-ai-backend.onrender.com/v1/rc-webhook`  
Authorization = same secret → Send test event.

`GET /health` should show `"usageStore":"upstash"`.

### 5. TestFlight build ⏰

In Xcode:

1. Select **Any iOS Device (arm64)** (or a connected iPhone)
2. Product → **Archive**
3. Organizer → **Distribute App** → App Store Connect → Upload
4. ASC → TestFlight → wait for processing → add yourself as Internal Tester
5. Install via TestFlight app

CLI alternative (once signing works):

```bash
xcodebuild -scheme PrivateAI -project PrivateAI.xcodeproj \
  -destination 'generic/platform=iOS' \
  -archivePath build/PrivateAI.xcarchive archive
# then Organizer upload, or use altool / notary as you prefer
```

### 6. Sandbox money check (TestFlight)
1. Burn free messages → Upgrade → sandbox purchase
2. UI shows Pro; Render logs `[rc-webhook] INITIAL_PURCHASE`
3. Kill app → still Pro; Restore Purchases works
4. Smoke: share card, Face ID lock, ghost chat, Live Activity, iMessage ask, widget tap

## Day 2 — store listing + submit

### 7. Privacy Nutrition Labels
Match `PRIVACY.md` / `store/LISTING.md` (device ID + processed content, no tracking).

### 8. Listing copy + screenshots
Paste `store/LISTING.md`. Capture frames from `store/SCREENSHOTS.md`
(6.9" + 6.5").

### 9. Submit
- Attach `pro_monthly` to the version
- Subscription review screenshot = paywall
- Review notes from `store/LISTING.md`
- Prefer automatic release on approval

### 10. Launch day
- Confirm https://apps.apple.com/app/id6785089361
- Watch Render + Upstash for first purchases
- Never re-enable `ALLOW_CLIENT_PRO`

## Deliberately later
- Sentry
- App Attest hardening
- Optional Sign in with Apple only if you add opt-in sync
