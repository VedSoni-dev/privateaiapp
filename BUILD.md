# Building Private AI (no Mac required)

You have Expo + access to Martin's Apple Developer team. Follow these steps in order.

## Before you start — confirm with Martin

1. **Accept the Apple invite** — Check your email for an invite from Apple Developer. Accept it, then sign in at [developer.apple.com](https://developer.apple.com) with your Apple ID.
2. **Your role** — You need at least **Developer** or **Admin** to register devices and create provisioning profiles. If builds fail on credentials, Martin may need to bump your role.
3. **Bundle ID** — This project uses `inc.neocast.privateai` (registered under Neocast Inc.'s Apple team).

---

## One-time setup (on your Windows PC)

Open PowerShell in the project folder:

```powershell
cd C:\Users\vedan\privateaiapp
npm install
npx install-expo-modules@latest
```

When `install-expo-modules` asks questions, accept defaults.

Link the project to your Expo account:

```powershell
npx eas login
npx eas init
```

`eas init` creates the Expo project and writes a `projectId` into `app.config.js`.

---

## Register your iPhone

EAS needs your phone's UDID for internal installs:

```powershell
npx eas device:create
```

- Open the link on your **iPhone**
- Install the small profile it asks for (Settings → General → VPN & Device Management)
- Your device is then registered with Apple's portal (via Martin's team)

---

## Build and install on your iPhone

```powershell
npm run build:ios
```

Or explicitly:

```powershell
npx eas build --platform ios --profile preview
```

During the first build, EAS will ask:

| Prompt | What to choose |
|--------|----------------|
| Apple account | **Your** Apple ID (the one Martin added to the team) |
| Team | **Martin's team** (not your personal team, if you have one) |
| Credentials | **Let EAS handle it** (recommended) |

When the build finishes (~15–25 min), you'll get a link/QR code. Open it **on your iPhone** to install Private AI.

---

## After install — running the app

The preview build is a **standalone app** (not Expo Go). You do **not** need Metro running for daily use.

On first launch:

1. App downloads the AI model (~250MB) — use Wi‑Fi
2. Then you can chat offline

For **development** with hot reload, you'd use a `development` profile build + `npm start` — optional for now.

---

## TestFlight (App Store beta)

TestFlight uses a **production** build (App Store signing), not the `preview` profile you used for direct install.

### One-time: Martin / App Store Connect

Martin (or anyone with **Admin** on the Apple team) should confirm:

1. Bundle ID `inc.neocast.privateai` exists in [Apple Developer → Identifiers](https://developer.apple.com/account/resources/identifiers/list)
2. An app record exists in [App Store Connect](https://appstoreconnect.apple.com) → **Apps** → **+** → New App  
   - Platform: iOS  
   - Name: **Private AI** (or similar)  
   - Bundle ID: `inc.neocast.privateai`  
   - SKU: anything (e.g. `private-ai`)

If the app record is missing, `eas submit` may fail until it's created.

### Build for TestFlight (run in PowerShell on your PC)

Your project files aren't committed to git yet, so use `EAS_NO_VCS=1` so EAS uploads **all** current code (search fix, design, attachments, etc.):

```powershell
cd C:\Users\vedan\privateaiapp
$env:EAS_NO_VCS=1
npx eas build --platform ios --profile production
```

**First production build only** — EAS will ask:

| Prompt | Choose |
|--------|--------|
| Apple account | Your Apple ID (the one Martin added to the team) |
| Team | **Neocast Inc.** (`749YZ5JL3X`) |
| Credentials | **Let EAS handle credentials** (creates App Store distribution cert) |

Wait ~15–25 minutes. Build number auto-increments (already bumped to **2**).

### Submit to TestFlight

When the build finishes:

```powershell
npx eas submit --platform ios --latest
```

Or submit a specific build:

```powershell
npx eas submit --platform ios --id <BUILD_ID>
```

Sign in with the same Apple ID. Pick the **Private AI** app in App Store Connect when prompted.

### Install on your iPhone

1. Install **TestFlight** from the App Store (if you don't have it).
2. Martin (or you, if you're on the team) opens [App Store Connect](https://appstoreconnect.apple.com) → your app → **TestFlight** → **Internal Testing**.
3. Add the new build to the internal group and add your Apple ID email as a tester.
4. You get an email invite → open in TestFlight → **Install**.

Internal testers (people on the developer team) usually get the build within minutes — no beta review.

### Optional: commit before future builds

So you don't need `EAS_NO_VCS=1` every time:

```powershell
git add .
git commit -m "Private AI v1.0 — chat, web search, attachments"
```

Then `npx eas build --platform ios --profile production` works normally.

---

## TestFlight / App Store (quick reference)

```powershell
$env:EAS_NO_VCS=1
npm run build:ios:prod
npx eas submit --platform ios --latest
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "No team found" | Accept Apple's invite; sign in with the correct Apple ID |
| "Bundle ID not available" | Pick another ID in `app.config.js` + `ios/.../project.pbxproj`, or register `com.privateai.app` in Developer portal |
| "Device not in profile" | Run `npx eas device:create` again, then rebuild |
| Build fails on native code | Check build logs at [expo.dev](https://expo.dev) → your project → Builds |

---

## Quick command reference

```powershell
npx eas login              # Log into Expo
npx eas device:create        # Register iPhone
npm run build:ios            # Cloud build → install on phone
npx eas build:list           # See past builds
```
