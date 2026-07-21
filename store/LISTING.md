# App Store listing — paste into App Store Connect

Native SwiftUI build (v3). Character limits noted; all entries fit.

## App name (30 chars max)
```
Private AI — Confidential Chat
```
Fallbacks if taken: `Private AI: Locked Chat`, `PrivateAI — Secure Assistant`

## Subtitle (30 chars max)
```
AI nobody else can read
```

## Promotional text (170 chars max — editable without a new binary)
```
Ask anything. No account. No ads. Answers run in confidential compute — built so we can’t casually read them. 10 free messages every day.
```

## Description (4000 chars max)
```
Most AI chat apps turn your questions into their product. Private AI is built so that doesn’t happen.

NO ACCOUNT. ON PURPOSE.
No email. No password. No profile. An anonymous device ID handles free limits and Pro — nothing to phish, nothing to dox. Pro restores through Apple, not a Private AI login.

CONFIDENTIAL BY ARCHITECTURE
Prompts are processed for answers inside a confidential-compute setup. Your phone never holds the model API key. Ghost chats never save. Memory lives on your device — visible, pinnable, erasable.

EVERYTHING YOU WANT FROM A MODERN ASSISTANT
• Streaming answers for writing, code, advice, and explanations
• Quiet live lookups when facts change day to day — still framed as private
• Markdown answers with copyable code
• Speak replies out loud
• Smart follow-ups and personalized openers that learn what matters to you
• Share cards, calendar add, Share Extension, Home Screen widget
• iMessage app: ask in a DM or group so everyone sees the bubble
• Face ID / Touch ID lock, Siri shortcuts, Action Button ready
• Light, dark, or system appearance

MEMORY YOU CONTROL
Facts Private AI learns show up in Settings. Pin them. Forget one. Forget all. Ghost chats teach nothing.

FREE EVERY DAY
10 messages a day, free, forever. No credit card. No signup.

PRO
Unlimited messages. Same privacy posture. Cancel anytime in Settings → Apple ID → Subscriptions.

Your questions deserve better than becoming someone’s training set.
```

## Keywords (100 chars max, comma-separated, no spaces after commas)
```
private ai,chatgpt,confidential,encrypted chat,ai assistant,secure,anonymous,privacy,chatbot,siri
```

## What’s New (3.0.0 — native rewrite)
```
All-new native iOS app: confidential chat, no account, Face ID lock, memory you control, speak answers, iMessage asks, Home Screen widget, and 10 free messages a day.
```

## App Review notes
```
No account or login — works immediately after onboarding.

Free tier: 10 messages/day per anonymous device ID. Pro is an auto-renewing monthly subscription (product id pro_monthly) via StoreKit/RevenueCat; restore purchases uses Apple ID.

Privacy: confidential-compute inference; on-device chat history + memory; ghost chats not saved. Tap the title bar or Settings → How privacy works for the in-app explainer. Terms + Privacy Policy linked in onboarding and paywall.

Live lookups run only when fresh facts help; the app does not offer a “leave private mode” switch.

Content moderation: long-press an AI answer → Report (opens prefilled GitHub issue).

iMessage extension: Apps drawer → Private AI. Apple does not allow reading the full thread; users paste context or select a prior Private AI bubble.

Live Activities / Dynamic Island may appear while an answer streams.
```

## Category
- Primary: Productivity
- Secondary: Utilities

## Age rating pointers
- Unrestricted web access: **No** (no in-app browser; server-curated snippets only)
- AI-generated content: Yes — disclose honestly (typically 12+)

## URLs
- Support: https://github.com/VedSoni-dev/privateaiapp
- Privacy Policy: https://github.com/VedSoni-dev/privateaiapp/blob/main/PRIVACY.md
- Terms: https://github.com/VedSoni-dev/privateaiapp/blob/main/TERMS.md
- Marketing / App Store: https://apps.apple.com/app/id6785089361

## Privacy Nutrition Labels (honest match to PRIVACY.md)
- Identifiers → Device ID — App Functionality, not linked, not used for tracking
- User Content → processed for answers (App Functionality), not stored by you beyond inference; not tracking
- Purchases → via Apple / RevenueCat — App Functionality
- No advertising / no tracking SDKs
