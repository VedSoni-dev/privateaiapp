# Building Private AI (native SwiftUI)

## Dev loop

```bash
brew install xcodegen
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
cd ~/PrivateAIApp
xcodegen generate
open PrivateAI.xcodeproj
```

⌘R on a Simulator. Set **Team** under Signing for device / TestFlight / Archive.

## Targets

| Target | Role |
|--------|------|
| Private AI | Main app |
| PrivateAIWidget | Home widget + Live Activities |
| ShareExtension | Share sheet → `privateai://share` |
| MessagesExtension | iMessage app (DM / group asks) |

StoreKit product: `pro_monthly` · RevenueCat entitlement `pro` · webhook on Render  
(`LAUNCH.md`). Free tier: **10**/day (`FREE_DAILY_LIMIT`).

## TestFlight (short path)

1. Xcode → Signing: your Team on all targets  
2. Product → Archive (Any iOS Device)  
3. Distribute → App Store Connect → Upload  
4. ASC → TestFlight → Internal testing → install  

Full money + listing checklist: **`LAUNCH.md`**.  
Store copy + screenshots: **`store/LISTING.md`**, **`store/SCREENSHOTS.md`**.

## Legacy

Expo tree lives under `_legacy_expo/` only — do not ship it.
