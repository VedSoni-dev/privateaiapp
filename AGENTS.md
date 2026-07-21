# AGENTS.md

Primary docs: `README.md`, `BUILD.md`, `CLAUDE.md`.

## Active stack

- **App**: native SwiftUI under `PrivateAI/` (`project.yml` → `PrivateAI.xcodeproj`)
- **Backend / Worker**: `server/`, `worker/` (unchanged from Expo era)
- **Legacy**: `_legacy_expo/` — do not treat as the product; reference only when porting features

## Commands

```bash
xcodegen generate
open PrivateAI.xcodeproj
xcodebuild -scheme PrivateAI -destination 'platform=iOS Simulator,name=iPhone 17' build
```

Server unit tests: `npm test` from repo root only works if `_legacy_expo/package.json` scripts are used, or run `node --test server/logic.test.js` directly.
