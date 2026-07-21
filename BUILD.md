# Building Private AI on a Mac (first-time iPhone setup)

You are shipping a **managed Expo** iOS app. On a Mac you still do **not** need
to open Xcode every day — Expo + EAS Cloud Build compile the native bits in the
cloud. You *do* need a Mac (or at least an Apple Developer account + EAS) to
sign, install TestFlight builds, and submit to the App Store.

This guide replaces the old Windows / PowerShell flow. Use **Terminal.app**
(or iTerm) throughout.

## What you need before typing anything

1. **Mac** with macOS recent enough for Xcode Command Line Tools (Sonoma/Sequoia fine).
2. **Apple ID** that is on the Neocast Inc. Apple Developer team (`749YZ5JL3X`).
   Accept the invite email → confirm at [developer.apple.com](https://developer.apple.com).
3. **Role**: Developer or Admin (needed for devices + provisioning).
4. Bundle ID (already set): `inc.neocast.privateai` in `app.json`.
5. Free accounts: [expo.dev](https://expo.dev), and later RevenueCat (see `LAUNCH.md`).

You do **not** need a full local Xcode iOS build for day-to-day JS work.
Expo Go or a one-time **dev client** build is enough.

---

## Day 0 — install the Mac toolchain (once)

Open Terminal and run:

```bash
# 1) Homebrew (if you don't have it)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2) Node 20 LTS (matches CI) + git if missing
brew install node@20 git
# follow the brew "caveats" to put node@20 on your PATH if needed

# 3) Xcode Command Line Tools (needed by Expo / cocoapods / signing helpers)
xcode-select --install

# 4) Optional but useful: full Xcode from the Mac App Store
#    (Simulator + Instruments). Not required for EAS cloud builds.
```

Confirm:

```bash
node -v   # should be v20.x (or ≥18)
npm -v
git --version
```

Clone and install (pick your real path):

```bash
cd ~/Developer   # or wherever you keep projects
git clone https://github.com/VedSoni-dev/privateaiapp.git
cd privateaiapp
npm install
```

Worker deps only if you will run search locally:

```bash
cd worker && npm install && cd ..
```

---

## Day-to-day JS development (no native rebuild)

This is the fast loop — same as on Windows, but in Terminal:

```bash
cd ~/Developer/privateaiapp
npm start
# or: npx expo start --go -c
```

- Install **Expo Go** from the App Store on your iPhone.
- Phone and Mac on the same Wi‑Fi → scan the QR code in Terminal (Camera app
  or Expo Go).
- Hot reload works for almost all `src/` changes.

**Native modules** (RevenueCat / Live Activities / Share Extension / etc.) are
lazily loaded so Expo Go still boots. Real purchases, Dynamic Island, and the
Share Extension only work in a **dev-client** or **TestFlight** build — not in
Expo Go. That is expected.

Typecheck / lint / unit tests (run these after non-trivial changes):

```bash
npx tsc --noEmit
npm run lint
npm test
```

---

## One-time: link Expo + register your iPhone

```bash
npx eas-cli@latest login
npx eas-cli@latest whoami
# Project is already linked (app.json → extra.eas.projectId). No eas init needed.
```

Register the physical iPhone for internal / development installs:

```bash
npx eas-cli@latest device:create
```

Open the link **on the iPhone**, install the profile
(Settings → General → VPN & Device Management). Your UDID is then on the team.

---

## Which build do I want?

| Goal | Profile | Command |
|------|---------|---------|
| Daily JS iteration | (none) | `npm start` + Expo Go |
| Test native features (IAP, Live Activities, Share Extension) | `development` | `npx eas build --platform ios --profile development` then `npm start` |
| Internal install without Expo Go | `preview` | `npx eas build --platform ios --profile preview` |
| TestFlight / App Store | `production` | see below / `LAUNCH.md` |

First time EAS asks:

| Prompt | Choose |
|--------|--------|
| Apple account | **Your** Apple ID (the one on Martin's / Neocast team) |
| Team | **Neocast Inc.** (`749YZ5JL3X`) |
| Credentials | **Let EAS handle it** |

Build takes ~15–25 minutes. When it finishes, open the install link **on the iPhone**.

### Development client (recommended once before launch)

```bash
npx eas build --platform ios --profile development
```

Install that build, then on the Mac:

```bash
npm start
```

The custom client loads Metro the same way Expo Go does, but with native
modules present — this is how you verify Live Activities + purchases before
TestFlight.

---

## TestFlight (App Store beta)

App Store Connect already has this app (`ascAppId` `6785089361` in `eas.json`;
share card already points at `https://apps.apple.com/app/id6785089361`).

```bash
cd ~/Developer/privateaiapp
npx eas build --platform ios --profile production
npx eas submit --platform ios --latest
```

Then: App Store Connect → TestFlight → Internal Testing → add your Apple ID →
install via the TestFlight app.

Full money-path + store-listing checklist: **`LAUNCH.md`** (do that next —
most of "finishing" the app is account config, not more code).

---

## Mac-only gotchas (first-time iOS)

- **Signing lives in the cloud with EAS** if you pick "Let EAS handle it". You
  rarely open Xcode → Signing & Capabilities for this project.
- **Simulator**: optional. Prefer a real iPhone for StoreKit sandbox, Face ID,
  Dynamic Island, and Share Extension.
- **Same Wi‑Fi**: if the Expo QR fails, press `s` in the Expo terminal to switch
  to tunnel mode, or run `npx expo start --tunnel`.
- **EAS free tier**: 15 builds/month. Batch native changes; JS-only changes do
  not need a new native build (OTA / reload is enough in Expo Go / dev client).
- Do **not** use the old Windows `EAS_NO_VCS=1` workaround — the repo is on git;
  commit before production builds so EAS uploads what you think it uploads.

---

## Quick command card

```bash
npm install                          # after pull
npm start                            # Expo Go / Metro
npx tsc --noEmit && npm run lint && npm test
npx eas build --platform ios --profile development
npx eas build --platform ios --profile production
npx eas submit --platform ios --latest
cd worker && npx wrangler dev        # local search Worker (optional)
```

Architecture, env vars, and gotchas: **`CLAUDE.md`**.  
Public launch (IAP + ASC + RevenueCat): **`LAUNCH.md`**.  
Store listing paste: **`store/LISTING.md`**.
