# Private AI — Agent Runbook (native SwiftUI)

Native iOS app (SwiftUI). Expo sources live in `_legacy_expo/` for reference only.

## Architecture

```
iPhone app (SwiftUI, PrivateAI/)
  ├─ /v1/chat, /v1/usage  →  Render backend (server/index.js)
  │                            └─ privatemode-proxy (confidential compute)
  └─ /search (optional)   →  Cloudflare Worker (worker/)
```

- Backend URL: `https://private-ai-backend.onrender.com`
- Bundle ID: `inc.neocast.privateai`
- The app never holds the inference API key.

## Commands

```bash
xcodegen generate
open PrivateAI.xcodeproj
# or:
xcodebuild -scheme PrivateAI -destination 'platform=iOS Simulator,name=iPhone 16' build

cd server && npm test          # usage/entitlement logic
```

First-time Mac: install **iOS platform** in Xcode → Settings → Components
(or `xcodebuild -downloadPlatform iOS`).

## Still to port from Expo

RevenueCat IAP, Share Extension, Live Activities, Face ID lock UI, share cards,
web-search agent orchestration. Backend + Worker are unchanged.
