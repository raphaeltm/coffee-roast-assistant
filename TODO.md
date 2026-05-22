# Coffee Roast Assistant — Development Tracking

## Phase 1 — Manual Guided Roasting (MVP 1) ✅

### Completed
- [x] Project scaffold (Expo SDK 54, React Native, TypeScript, Zustand, React Navigation)
- [x] Roast profile JSON data source (`src/data/roastProfiles.json`)
- [x] Type definitions aligned to JSON schema (`src/types/index.ts`)
- [x] Phase color utilities — all 5 phases including preheat/end (`src/utils/phaseColors.ts`)
- [x] Data loader (`src/data/index.ts`)
- [x] Roast Engine — sequential state machine (`src/engine/roastEngine.ts`)
- [x] Zustand store (`src/store/roastStore.ts`)
- [x] Profile selection screen
- [x] Active roast screen — phase header, temperature reference, action checkboxes, next preview
- [x] Checkbox-driven advancement: "Next →" button unlocks when all actions checked
- [x] Info events show note text with immediate "Next →" (no checkboxes needed)
- [x] Navigation wired up
- [x] E46 branding — splash screen logo, app renamed "E46 Roast"
- [x] Watermark logo on profile select screen (E46 Inverted Logo)

---

## Phase 1 — MVP 2 (pick up here tomorrow)

### Goal
Start a timer when the roast begins (first event checkboxes confirmed at 370°F PID),
then warn the roaster ~10 seconds before the estimated time of the next event.

### What needs to happen

#### 1. Add estimated times to the JSON
Each event needs an `estimated_time_seconds` field (time elapsed from roast start).
These values need to be researched/estimated based on typical roast curves.

Example shape to add to each event in `roastProfiles.json`:
```json
"estimated_time_seconds": 120
```

#### 2. Build a timer in the engine/store
- Record `roastStartedAt: number` (unix ms) when first event is confirmed
- Each tick, calculate `elapsedSeconds = (Date.now() - roastStartedAt) / 1000`
- Compare elapsed against next event's `estimated_time_seconds`
- If within 10 seconds of next event → trigger pre-alert

#### 3. Pre-alert UI
- Show a warning banner: "Next step in ~Xs"
- Sound alert (expo-av or expo-haptics)
- Haptic feedback
- IMPORTANT: Pre-alerts must NEVER auto-advance the step — temperature/manual only

#### 4. Timer display (advisory)
- Show elapsed time since roast start somewhere on the RoastScreen
- Label it clearly as advisory (not a trigger)

### Files to touch
- `src/data/roastProfiles.json` — add `estimated_time_seconds` to all events
- `src/types/index.ts` — add optional `estimated_time_seconds` to event interface
- `src/engine/roastEngine.ts` — add timer evaluation logic
- `src/store/roastStore.ts` — add `roastStartedAt`, timer interval, pre-alert state
- `src/screens/RoastScreen.tsx` — add elapsed display + pre-alert banner

---

## Phase 2 — Smart Assisted Roasting (later)
- [ ] Rate of Rise (ROR) calculation from temperature history
- [ ] Historical roast comparison view

---

## Phase 3 — Artisan Integration (future)
- [ ] Research Artisan WebSocket / MQTT API
- [ ] Live temperature feed from Artisan
- [ ] Automated event triggering when thresholds are reached
- [ ] ROR prediction using live data
- [ ] Semi-automated roasting assistance mode

---

## Profile Admin Tool (browser-based)

- [ ] Small local Node/Express server + web UI
- [ ] View, edit, and add roast profiles
- [ ] Edits save directly to `src/data/roastProfiles.json`
- [ ] Reload Expo to see changes in the app
- [ ] Run on Mac at desk — not needed on-device

---

## Tech Debt
- [ ] Upgrade from Expo SDK 54 → SDK 56 (currently on 54 for Expo Go compatibility)
  - Requires: install Xcode for iOS Simulator, OR set up EAS Build
  - Reference: https://docs.expo.dev/versions/v56.0.0/

---

## Architecture Rules (do not break)
- Temperature is the ONLY authoritative trigger for event progression in Phase 2+
- All roast logic lives in `src/engine/` — never in UI components
- JSON is the single source of truth — do not duplicate profile logic in code
- Pre-alerts must NEVER trigger state transitions
