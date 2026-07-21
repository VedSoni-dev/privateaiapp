# Private AI

Native **SwiftUI** iPhone app. Chat streams through Privatemode confidential-compute
via the Render backend; web search uses the Cloudflare Worker.

## Run (Mac / Xcode)

```bash
cd ~/PrivateAIApp
xcodegen generate
open PrivateAI.xcodeproj
```

⌘R on an iPhone simulator or device. **No Expo Go. No EAS for daily work.**

## What’s in the native app

| Feature | Status |
|---------|--------|
| Streaming chat + agent (SEARCH/NONE + Worker) | ✅ |
| Onboarding, theme, sessions, ghost chats | ✅ |
| Memory list + learn | ✅ |
| Usage sync + StoreKit 2 Pro paywall (`pro_monthly`) | ✅ |
| Face ID lock | ✅ |
| Share cards + message actions (copy/share/calendar/report) | ✅ |
| Share Extension (`privateai://share`) | ✅ |
| Live Activity / Dynamic Island | ✅ |
| Backend + Worker | ✅ unchanged |

## Layout

```text
PrivateAI/           main SwiftUI app
PrivateAIWidget/     Live Activity extension
ShareExtension/      share sheet → app
Shared/              Activity attributes
server/ worker/      cloud services
_legacy_expo/        old Expo app (reference)
```

Bundle ID: `inc.neocast.privateai` · ASC: `6785089361`

## License

Apache 2.0. See LICENSE.
