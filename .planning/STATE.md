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
- **Siri-like messages**: Speak/Stop (AVSpeech), action row, follow-up chips,
  App Shortcuts (new chat / ghost / speak last answer)
- **Brand**: crimson lock-bubble icon, `BrandMark` / `BrandCanvas`
- **Memory v2**: categories, pin, learn toggle, ranked injection, dedupe
- **Agent**: always-on silent live lookup, layered prompts, markdown + code fences
- **10 free msgs/day**; no Web toggle (privacy-first UX)
- Personalized suggestion chips from memory + recent chats

## Still open (priority)

1. Quota-reset local notification
2. XCUITest + device Accessibility Nutrition Labels
3. ASC + RevenueCat webhook account config (`LAUNCH.md`)
4. Redeploy server with `FREE_DAILY_LIMIT=10` if env still pinned to 20
5. Optional: typed App Entity for “Ask Private AI {question}” Siri phrases
