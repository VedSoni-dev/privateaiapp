# Accessibility Audit: Private AI

**Platform(s)**: iPhone (+ iPad supported in `app.json`; phone is primary)
**Audit Date**: 2026-07-20
**Scope**: full (phases 1–5; labels declaration gated — not applied)
**Stack note**: Managed Expo / React Native (SDK 54). No committed `ios/` tree, no app XCUITest
target. Phase 2 automated `performAccessibilityAudit` is **not runnable** until a
dev-client / prebuild + UITest target exists. This audit = static RN scan + architecture
review + manual-pass checklist. CLAUDE.md already claims “accessibility labels + 44pt
targets + AA contrast” — verified partially below.

**App Store ID**: `6785089361` · Bundle: `inc.neocast.privateai`

## Common Tasks Evaluated

Primary (why people download):
1. **Chat** — ask a question, get a streaming AI answer (Private / Web mode)
2. **Use web search** when needed and understand sources
3. **Share an answer** (text or share-card image)
4. **Manage memory** — see / forget facts the AI learned

Fundamentals:
5. **First launch** — onboarding + Terms / Privacy acknowledgement
6. **Login** — N/A (no account)
7. **Purchase** — free daily cap → Pro paywall → subscribe / restore
8. **Settings** — history, theme, Face ID lock, ghost chat, erase everything
9. **App lock** — unlock with Face ID when enabled

Device families in scope for claims: **iPhone** (primary). iPad is `supportsTablet: true`
but not separately verified here — treat iPad claims as **unverified**.

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 Critical | 0 | — |
| 🟠 High | 6 | ⬜ Pending |
| 🟡 Medium | 5 | ⬜ Pending |
| 🟢 Low | 3 | ⬜ Pending |

No unlabeled control was found that fully blocks the **primary chat** or **paywall**
paths. Claims for **Larger Text**, **Reduced Motion**, and full **VoiceOver** coverage
of secondary actions are **not** safe yet.

---

## 🟠 High

### 1. Message actions are long-press-only (no `accessibilityActions`)
- **Screens / tasks**: Chat → copy / edit / regenerate / share / calendar / report
- **Feature**: VoiceOver, Voice Control
- **Issue**: `ChatMessageBubble` exposes `onLongPress` + hint only. Assistant bubble has
  **no** `accessibilityLabel`. VO users can often “double-tap and hold,” but there is no
  named action rotor / Voice Control name for “Share as Image,” “Copy,” “Report,” etc.
- **Fix**: Add `accessibilityActions` (and `onAccessibilityAction`) mirroring the Alert
  menu; set assistant label e.g. `AI answer` / truncated preview; keep long-press for sighted users.
- **Regression pass**: VoiceOver eyes-free share + copy on an answer

### 2. Larger Text will truncate key chrome (`numberOfLines={1}`)
- **Screens**: Chat status line, memory-moment banner, session list titles, source rows,
  tool pills (`ChatScreen.tsx`, `ChatMessageBubble.tsx`)
- **Feature**: Larger Text
- **Issue**: Hard `numberOfLines={1}` truncates instead of wrapping at 200–310%. Also
  `emptyTitle` uses fixed `fontSize: 32` + `lineHeight: 40` which can clip when scaled.
- **Fix**: Prefer wrapping / multi-line; use `maxFontSizeMultiplier` only where layout
  must stay compact; avoid fixed lineHeight tighter than scaled font.
- **Regression pass**: Dynamic Type 200% and 310% on chat empty state + settings list

### 3. Reduced Motion not respected
- **Screens**: Thinking dots (`ThinkingIndicator` always loops opacity animation);
  stack uses `TransitionPresets.SlideFromRightIOS` (`App.tsx`) with no Reduce Motion branch
- **Feature**: Reduced Motion
- **Issue**: Auto-playing animation + slide transitions continue with Reduce Motion on.
  Apple’s rule: **modify**, don’t only remove (e.g. static “Thinking…” + cross-fade).
- **Fix**: `AccessibilityInfo.isReduceMotionEnabled()` / `reduceMotionChanged`; static
  indicator; fade navigation when reduced motion is on.
- **Regression pass**: Settings ▸ Accessibility ▸ Motion ▸ Reduce Motion

### 4. Settings “Web search” `Switch` has no accessibility label
- **Screen**: Settings panel (`ChatScreen.tsx` ~1016)
- **Feature**: VoiceOver, Voice Control
- **Issue**: Dark mode + Face ID switches are labeled; **Web search** switch is not.
  Nearby text is not automatically associated on iOS RN.
- **Fix**: `accessibilityLabel="Web search"` + `accessibilityState={{ checked: webEnabled }}`
  (or `accessibilityRole` via Switch defaults + clear label).

### 5. Menu control below 44×44 pt
- **Screen**: Chat header hamburger (`menuButton`: **34×34**)
- **Feature**: Voice Control / motor / hit region (HIG / WCAG 2.5.5)
- **Issue**: Labeled (“Settings and chat history”) but hit target under 44pt. Paywall /
  Memory close buttons correctly use 44×44.
- **Fix**: Expand hit box to ≥44×44 (padding / `hitSlop` alone is weaker than layout size).

### 6. Onboarding Terms / Privacy are nested `Text` `onPress` links
- **Task**: First launch
- **Feature**: VoiceOver, Voice Control
- **Issue**: Inline `Text` with `onPress` often fails as a proper link focus stop vs
  `TouchableOpacity`/`Pressable` with `accessibilityRole="link"` (paywall does this right).
- **Fix**: Match paywall pattern — dedicated link buttons with roles + labels.

---

## 🟡 Medium

### 7. Page dots are color/width-only
- **Screen**: Onboarding — active dot widens + turns crimson
- **Feature**: Differentiate Without Color Alone
- **Mitigation**: Primary CTA (“Next” / “Get started”) still advances; dots are secondary.
- **Fix**: Add `accessibilityLabel={`Page ${page + 1} of ${slides.length}`}` on the dots
  container; optional numeric indicator.

### 8. Settings overlay dismiss `Pressable` has no label
- **Screen**: Dimmed backdrop (`Pressable` `closeMenu`)
- **Fix**: `accessibilityLabel="Dismiss settings"` `accessibilityRole="button"` (or
  hide from a11y if Close is enough and backdrop shouldn’t be in the rotor).

### 9. Clear-search control missing role
- **Fix**: `accessibilityRole="button"` on the ✕ clear control (label already present).

### 10. Error boundary “Try again” unlabeled
- **Screen**: Crash recovery (`ErrorBoundary.tsx`)
- **Fix**: `accessibilityRole="button"` `accessibilityLabel="Try again"`

### 11. Source rows not announced as links / not openable
- **Task**: Web search follow-up
- **Issue**: Sources render as text only (no `Linking.openURL`, no link trait).
- **Fix**: If URLs are meant to be opened, make them buttons/links with labels; else
  mark decorative / include URL in spoken label of the answer.

---

## 🟢 Low

### 12. Brand images may invert under Smart Invert
- Logo / empty-state `Image` — consider `accessibilityIgnoresInvertColors` if Smart Invert
  washes the mark.

### 13. No `accessibilityInputLabels` synonyms
- Icon-ish rows (“Ghost chat”, menu glyph) would benefit from Voice Control synonyms
  (“new private chat”, “menu”, “settings”).

### 14. Thinking indicator not in accessibility live region
- Streaming path already uses `AccessibilityInfo.announceForAccessibility` (good).
  Optional: `accessibilityLiveRegion="polite"` on the thinking row.

---

## ✅ Strengths

| Strength | Evidence |
|----------|----------|
| Broad, human `accessibilityLabel` / `Role` coverage on chat chrome, paywall, memory, lock, share extension | Static scan across `src/` |
| Paywall purchase path labeled (subscribe, restore, legal links, maybe later) | `PaywallModal.tsx` |
| WCAG AA body/muted text vs cream **and** dark canvases (computed) | `textMuted` light **4.92:1**, dark **4.98:1**; primary text AAA |
| Explicit 44×44 close targets on paywall / memory | Style comments + layout |
| Status / completion announcements for generation & erase | `AccessibilityInfo.announceForAccessibility` in `ChatScreen` |
| Manual dark theme (not system-linked yet) | Settings toggle; dark palette AA-checked in code comments |
| No login wall | Simplifies first-launch + VoiceOver path |
| Share Extension primary actions labeled | `ShareExtension.tsx` |

---

## Phase 2 — Automated XCUITest

**Skipped.** No app Swift sources / no `ios/` project (Expo CNG; native dirs gitignored).
`performAccessibilityAudit` requires a simulator build + UI test target.

**Offer**: after first `eas build --profile development` or local `npx expo prebuild`,
add a UITest target and one audit per screen state (Onboarding, Chat empty, Chat with
messages, Settings, Paywall, Memory, Lock). Until then, treat Phase 2 as ⬜ blocked.

---

## Phase 4 — Manual pass checklist (you run on device)

| Pass | Setting | Pass criterion | Status |
|---|---|---|---|
| VoiceOver | Settings ▸ Accessibility ▸ VoiceOver | Complete tasks 1–5, 7–9 eyes-free; every control speaks label + trait + value | ⬜ |
| Voice Control | Voice Control on | Name every control to finish chat + paywall + settings | ⬜ |
| Larger Text | 200%, then ~310% | Chat + settings + paywall wrap; no overlap; fields grow | ⬜ |
| Sufficient Contrast | Increase Contrast; light + dark | Legible everywhere | ⬜ (static AA OK) |
| Dark Interface | Dark mode + Smart Invert | Tasks work; photos/logo not wrongly inverted | ⬜ |
| Reduced Motion | Reduce Motion on | Thinking dots + nav slides modified | ⬜ (code fails today) |

---

## Nutrition Label Claims

| Feature | iPhone | iPad | Evidence / blocker |
|---|---|---|---|
| VoiceOver | ⚠️ Fix first | ⚠️ Unverified | Strong labels on primary path; message actions + web Switch + assistant label gaps (🟠 #1, #4) |
| Voice Control | ⚠️ Fix first | ⚠️ Unverified | Same as VO; missing switch label / synonyms |
| Larger Text | ⚠️ Fix first | ⚠️ Unverified | `numberOfLines={1}` + tight lineHeights (🟠 #2); needs device pass at 310% |
| Sufficient Contrast | ✅ Claim *after* Increase Contrast device pass | ⚠️ Unverified | Static AA pairs pass light + dark |
| Dark Interface | ✅ Claim *after* Smart Invert spot-check | ⚠️ Unverified | Manual dark mode implemented |
| Differentiate Without Color Alone | ✅ Claim (soft) | ⚠️ Unverified | Mode toggles use selected state + text; onboarding dots secondary (🟡 #7) |
| Reduced Motion | ⚠️ Fix first | ⚠️ Unverified | Thinking animation + slide transitions ignore setting (🟠 #3) |
| Captions | — N/A | — N/A | No video/audio content |
| Audio Descriptions | — N/A | — N/A | No media content |

**Claimable now (code evidence only, still need your device confirm):** 0 hard claims  
**After High fixes + manual confirm:** ~5 of 9 (VO, Voice Control, Contrast, Dark, Differentiate)  
**Fix first:** Larger Text, Reduced Motion (+ VO/VC polish)  
**N/A:** Captions, Audio Descriptions  

**Declared in App Store Connect**: not yet (no ASC write this run; no accessibility MCP in session)

### Suggested ASC declaration (only after fixes + your OK)

```
IPHONE:
  VoiceOver: true          # after 🟠 #1 #4 #6
  VoiceControl: true       # after 🟠 #1 #4
  LargerText: false        # until 🟠 #2 fixed + 310% pass
  SufficientContrast: true # after Increase Contrast pass
  DarkInterface: true      # after Smart Invert pass
  DifferentiateWithoutColorAlone: true
  ReducedMotion: false     # until 🟠 #3 fixed
  Captions: false          # N/A — leave unclaimed
  AudioDescriptions: false # N/A — leave unclaimed
```

Do **not** publish Larger Text or Reduced Motion until fixed — Apple’s model is
**fix first, claim after** (WWDC25 224).

---

## Action Plan

1. **🟠 #1 + assistant label** — `accessibilityActions` on message bubbles (unblocks VO claim)
2. **🟠 #4** — label Web search Switch (5-minute fix)
3. **🟠 #3** — Reduce Motion for thinking + navigation
4. **🟠 #2** — kill truncating `numberOfLines={1}` on user-facing chrome; relax empty-state lineHeight
5. **🟠 #5 + #6** — 44pt menu; proper onboarding legal links
6. Device: VoiceOver + 310% Dynamic Type + Reduce Motion pass → update this file
7. Optional: prebuild + XCUITest `performAccessibilityAudit` per screen
8. `/accessibility labels` (or ASC UI) — declare only what this report marks ✅ after your OK

## App Store listing cross-check

`store/LISTING.md` already markets dark mode and accessibility-adjacent privacy UX.
Do **not** add “fully accessible” / nutrition-label marketing copy until claims above are
honest. Link an accessibility webpage later if you publish one (optional ASC field).
