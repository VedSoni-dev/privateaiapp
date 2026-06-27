# Private AI

A ChatGPT-style assistant that runs **entirely on your iPhone** — no cloud, no account, no data leaving your device.

Built with [React Native](https://reactnative.dev/) and the [RunAnywhere SDK](https://docs.runanywhere.ai/react-native/introduction) for on-device LLM inference, speech-to-text, and text-to-speech.

## Features

- **Private chat** — Streaming conversations with a local language model (LiquidAI LFM2 350M)
- **100% on-device** — All AI processing happens on your phone
- **Works offline** — After the initial model download, no internet required
- **Voice assistant** — Optional voice mode with Whisper STT + Piper TTS (via menu)
- **No API keys** — Development mode runs inference locally with no cloud dependency

## Requirements

- **macOS** with Xcode 15+ (for iOS builds)
- Node.js 18+
- ~250MB storage for the LLM model (one-time download)
- Physical iPhone recommended (iOS Simulator has limited on-device AI support)

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
┌─────────────────────────────────────────┐
│              Private AI App              │
├─────────────────────────────────────────┤
│  Chat UI  →  RunAnywhere SDK  →  LLM    │
│              (on-device inference)       │
└─────────────────────────────────────────┘
```

On first launch, the app downloads the LLM model (~250MB) from Hugging Face. The model is cached on your device — subsequent launches load it from local storage.

## Project structure

```
src/
├── App.tsx              # SDK init + navigation
├── screens/
│   ├── ChatScreen.tsx   # Main ChatGPT-like interface
│   ├── VoicePipelineScreen.tsx
│   ├── SpeechToTextScreen.tsx
│   └── TextToSpeechScreen.tsx
├── services/
│   └── ModelService.tsx # Model download/load state
└── components/
    ├── ChatMessageBubble.tsx
    └── ModelLoaderWidget.tsx
```

## Models

| Model | Size | Purpose |
|-------|------|---------|
| LiquidAI LFM2 350M Q8_0 | ~250MB | Chat / text generation |
| Sherpa Whisper Tiny EN | ~75MB | Speech-to-text (optional) |
| Piper TTS US English | ~65MB | Text-to-speech (optional) |

## Android

Android builds are supported but require a **physical ARM64 device** (emulators won't work with the native inference libraries). See [RunAnywhere Android setup](https://docs.runanywhere.ai/react-native/installation) for details.

## Privacy

- Conversations are stored only in app memory during a session
- No analytics, telemetry, or cloud API calls for inference
- Microphone access is only used for optional voice features

## License

Apache 2.0 (see LICENSE). The RunAnywhere SDK has its own [license terms](https://runanywhere.ai/license).
