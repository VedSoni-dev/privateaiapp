# Private AI

A ChatGPT-style mobile assistant that runs in Expo Go. Chat replies are generated through Privatemode's confidential-compute cloud via the app backend; web search runs through a Cloudflare Worker.

## Features

- Private chat: streaming conversations through confidential-compute cloud inference
- Web search: current-info questions can pull live context through the Worker
- Memory: durable facts are recalled across sessions; the memory list is stored locally
- Local chat history: saved on the device with AsyncStorage
- Server-side usage state: daily caps and pro entitlement are tracked by the backend
- No API keys in the app: the phone only talks to your backend and search Worker

## Requirements

- Node.js 18+
- Expo Go on your phone
- Internet connection for chat responses and web search

## Quick Start

Install dependencies:

```bash
npm install
```

Start Metro for Expo Go:

```bash
npx expo start --go -c
```

Scan the QR code with Expo Go. No Xcode, native iOS build, or TestFlight loop is required for this Expo Go version.

## How It Works

```text
Phone app (Expo Go)
  -> Render backend (/v1/chat)
  -> Render backend (/v1/usage)
  -> Privatemode confidential-compute inference

Phone app (web search enabled)
  -> Cloudflare Worker (/search)
  -> Brave/DuckDuckGo plus curated fallbacks for common live-info queries
```

The app never holds a Privatemode API key or talks to Privatemode directly. It calls the backend, which proxies requests to Privatemode.

## Project Structure

```text
src/
  App.tsx                 Navigation and boot
  screens/
    OnboardingScreen.tsx
    ChatScreen.tsx        Main chat interface
  services/
    AgentService.ts       Search/memory/datetime orchestration
    BackendClient.ts      Talks to the backend /v1/chat
    WebSearchService.ts   Talks to the Cloudflare search Worker
    MemoryService.ts      Local memory storage plus backend extraction
    ChatStorageService.ts Local chat/session persistence
    UsageService.ts       Daily free-tier limit + backend sync
  components/
    ChatMessageBubble.tsx

server/                   Backend proxy to Privatemode
worker/                   Cloudflare Worker for web search
```

## Model

| Model | Purpose | Runs where |
| --- | --- | --- |
| gpt-oss-120b via Privatemode | Chat and text generation | Confidential-compute cloud |

## Privacy

- Chat history and remembered facts are stored locally on the phone.
- Chat generation and memory extraction use the confidential-compute backend.
- Web search can be disabled in the app.
- No analytics or telemetry are included in the app code.

## License

Apache 2.0. See LICENSE.
