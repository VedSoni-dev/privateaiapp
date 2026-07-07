# Private AI

A ChatGPT-style assistant, no account required. Chat replies are generated on [Privatemode](https://www.privatemode.ai/)'s confidential-compute cloud — encrypted end-to-end, never logged, never used for training — via our own backend.

Built with [React Native](https://reactnative.dev/), a [backend](server/) that proxies chat completions to Privatemode, and a [Cloudflare Worker](worker/) for web search.

## Features

- **Private chat** — Streaming conversations, generated via confidential-compute cloud inference (no plaintext ever seen by the server)
- **Web search** — The model decides when a query needs live info and pulls in search results
- **Memory** — Learns and recalls relevant facts about you across sessions
- **No API keys in the app** — The app never holds a Privatemode key or talks to it directly; only your own backend does

## Requirements

- **macOS** with Xcode 15+ (for iOS builds)
- Node.js 18+
- Internet connection (chat responses require reaching the backend)

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. iOS setup

```bash
cd ios && pod install && cd ..
```

### 3. Run on iPhone

```bash
npm start
```

In a second terminal:

```bash
npx react-native run-ios --device
```

Or open `ios/RunAnywhereStarter.xcworkspace` in Xcode and run on your connected iPhone.

## How it works

```
┌───────────────┐     ┌──────────────────┐     ┌────────────────────────┐
│  Chat UI      │ ──▶ │  Our Backend     │ ──▶ │  Privatemode proxy     │
│  (device)     │     │  (Render)        │     │  (confidential compute)│
└───────────────┘     └──────────────────┘     └────────────────────────┘
```

The app never holds a Privatemode API key or talks to it directly — it only calls our backend, which proxies to Privatemode's encrypted confidential-compute inference (`gpt-oss-120b`).

## Project structure

```
src/
├── App.tsx              # Navigation + boot
├── screens/
│   ├── OnboardingScreen.tsx
│   └── ChatScreen.tsx    # Main ChatGPT-like interface
├── services/
│   ├── AgentService.ts   # Tool-use orchestration (web search, memory, datetime)
│   ├── BackendClient.ts  # Talks to our backend's /v1/chat
│   ├── WebSearchService.ts
│   ├── MemoryService.ts
│   ├── ChatStorageService.ts
│   ├── AttachmentService.ts
│   └── UsageService.ts
└── components/
    └── ChatMessageBubble.tsx

server/                  # Backend that proxies chat completions to Privatemode
worker/                  # Cloudflare Worker for web search
```

## Model

| Model | Purpose | Runs where |
|-------|---------|------------|
| gpt-oss-120b (via Privatemode) | Chat / text generation | Confidential-compute cloud |

## Android

Android builds are supported. See the standard [React Native Android setup](https://reactnative.dev/docs/environment-setup) for details.

## Privacy

- Chat replies are generated on Privatemode's confidential-compute cloud (TEE-attested, end-to-end encrypted) via our own backend — the app never holds a Privatemode API key
- No analytics or telemetry

## License

Apache 2.0 (see LICENSE).
