# Private AI — State

**Stack**: Native SwiftUI (iOS 17+, SDK 26)  
**Version**: 3.0.0  
**Last modernize**: 2026-07-20

## Shipped

- Streaming chat + web-search agent, memory, ghost chats
- Face ID lock, Share Extension, Live Activities, share cards
- RevenueCat / StoreKit Pro paywall
- **Modernize pass**: floating Liquid Glass composer, SF Symbol chrome, haptics,
  Reduce Motion scroll, markdown inline answers, App Intents (“Ask/Open Private AI”)
- **Observation**: `@Observable` stores + `@Environment(AppModel.self)` / `@Bindable`
  (no Combine `ObservableObject` / `@Published` / `@EnvironmentObject`)
- Appearance: System / Light / Dark; biometry-aware lock copy
- Dynamic Type on paywall price

## Still open (priority)

1. Richer markdown (fenced code, tables)
2. Quota-reset local notification
3. App icon in asset catalog (`_legacy_expo/assets/icon-1024.png`)
4. XCUITest + device Accessibility Nutrition Labels
5. ASC + RevenueCat webhook account config (`LAUNCH.md`)
6. Optional: typed App Entity for “Ask Private AI {question}” Siri phrases
7. Segmented Private/Web picker if chips still feel small on device
