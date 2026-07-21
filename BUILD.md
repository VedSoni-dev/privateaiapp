# Building Private AI (native SwiftUI)

```bash
brew install xcodegen
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
cd ~/PrivateAIApp
xcodegen generate
open PrivateAI.xcodeproj
```

Set **Team** under Signing for device / TestFlight / Archive.

StoreKit product: `pro_monthly` · Entitlement server webhook still via RevenueCat on Render
(see `LAUNCH.md`). Local Pro also tracks StoreKit 2 transactions.

Extensions embedded: **PrivateAIWidget** (Live Activities), **ShareExtension**.

Legacy Expo: `_legacy_expo/` only.
