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
- [x] `estimated_time_seconds` added to all events (stored as seconds, displayed as M:SS)
- [x] `formatTime` / `parseTime` utilities
- [x] Browser-based profile admin (`admin/`) — edit profiles, events, times, actions, notes
- [x] Admin: duplicate profile, autocomplete action picker, time badge in event header
- [x] Admin: auto-reload after save, restores selected profile
- [x] Admin: "Hide in app" toggle for info events; engine skips hidden events
- [x] UI: Up Next card at 45% opacity
- [x] UI: current event card enlarged (58px temp, bigger checkboxes, larger action text)

---

## Phase 1 — MVP 2 ✅

### Completed
- [x] `estimated_time_seconds` added to all events in all profiles
- [x] Timer starts when leaving index 0 (preheat confirmed); `roastStartedAt` recorded in store
- [x] `test_offset_seconds` in JSON meta — simulates being mid-roast for faster testing
- [x] Elapsed timer displayed in phase bar alongside current step's estimated time
- [x] Overdue indicator — current step blinks red when elapsed > estimated time
- [x] Pre-alert fires 10s before current step's estimated time: haptic + sound + amber banner
- [x] Pre-alert fires based on **current** event's time (not next event's)
- [x] Pre-alert clears immediately on "Next →" tap
- [x] Alert sound: `assets/alert.mp3` via expo-av
- [x] All React hooks moved before early return (Rules of Hooks fix)
- [x] Settings screen — alert threshold (5/10/15/20/30s) + sound picker (7 options, previews on tap)
- [x] 6 roaster-appropriate alert sounds in assets/sounds/ (woodblock, wood pop, click/snap, clave, bell ×2)
- [x] Sound preference persisted via AsyncStorage; alert threshold persisted via AsyncStorage
- [x] ⚙️ gear icon on profile select screen navigates to Settings
- [x] RecipeScreen — shows recipe text and DTP target between profile select and active roast
- [x] `recipe` and `dtp_target` fields added to RoastProfile type and JSON
- [x] Step counter: action events show "N/total · step", info events show "Info N · note"
- [x] Admin: Recipe textarea and DTP input per profile
- [x] Admin: event cards show "Step N" / "Info N" labels with index tooltip
- [x] Phase header layout: phase label · estimated time (blinks red/amber) · elapsed · profile name
- [x] Temp badge layout: time remaining (left) · temperature ref (centre) · step counter (right)

---

## Phase 2 — Smart Assisted Roasting (later)
- [ ] Rate of Rise (ROR) calculation from temperature history
- [ ] Historical roast comparison view

---

## Phase 3 — Artisan Integration (in progress — feat/phase-3-artisan)
- [x] `TemperatureProvider` abstraction interface + `ManualProvider` stub (`src/engine/temperatureProvider.ts`)
- [x] Python WebSocket bridge (`bridge/bridge.py`) — relays Artisan data to iPhone app
- [x] Bridge hardened for websockets ≥13, defensive coercion, RoR calculation, per-client queues (PR #4)
- [x] Bridge developer docs + Node.js test harness (`bridge/proto/`) — all 5 scenarios pass
- [x] Bridge venv setup (`bridge/.venv/`), gitignored; `run-tests.js` Python path fixed
- [ ] Bridge IP input + connection status in Settings screen
- [ ] Wire `ArtisanProvider` into the Zustand store (replace `ManualProvider`)
- [ ] Live temperature display in RoastScreen
- [ ] Automated event triggering when temperature thresholds are reached
- [ ] RoR display and prediction using live data
- [ ] Semi-automated roasting assistance mode

---

## Profile Admin Tool (browser-based) ✅

- [x] Small local Node/Express server + web UI (`admin/`)
- [x] View, edit, add, duplicate and delete roast profiles
- [x] Edits save directly to `src/data/roastProfiles.json`
- [x] Run with `cd admin && npm start` → http://localhost:3001

---

## Standalone App Build (no WiFi / no Mac required)

- [ ] Set up EAS Build (Expo's cloud build service — free tier)
- [ ] Create a development build installable directly on iPhone (no App Store, no Expo Go)
- [ ] App will open independently, fully offline
- [ ] Reference: https://docs.expo.dev/build/introduction/
- [ ] Prerequisite: Apple Developer account ($99/yr) needed for device installation

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
