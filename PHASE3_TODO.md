# Phase 3 — Artisan Integration: To-Do
_Phase 3 development checklist — kept for tracking progress_

---

## Step 1 — Merge PR #4 (bridge hardening) ✅ DONE
**Action:** Merge raphaeltm's PR #4 into `feat/phase-3-artisan`
- Fixes the websockets ≥13 routing bug
- Adds `bridge/proto/` test harness (mock Artisan + mock iPhone)
- No app code changes — bridge only

---

## Step 2 — Local end-to-end test (Mac + iPhone, no Windows needed) ✅ DONE

**Goal:** Confirm the full data pipeline works before touching the Windows laptop.

**Setup:**
```
Terminal 1:  cd bridge && source .venv/bin/activate && python3 bridge.py
Terminal 2:  node bridge/proto/mock_artisan.js   ← simulates Artisan
Terminal 3:  node bridge/proto/run-tests.js
```

**Notes:**
- Use `bridge/.venv` for Python deps (`pip install websockets` inside venv)
- `run-tests.js` manages its own bridge process — stop bridge.py before running it
- `bridge/.venv/` is gitignored

**Results (2026-06-02): 5/5 passed**
- [x] T1 happy-path end-to-end flow
- [x] T2 path-routing bug reproduced + fixed
- [x] T3 junk readings don't kill the feed
- [x] T4 RoR magnitude correct (real-time)
- [x] T5 multi-client fan-out + mid-stream disconnect

---

## Step 3 — Add bridge IP setting to the app ✅ DONE

**Files changed:**
- `src/screens/SettingsScreen.tsx` — IP text input + colour-coded status dot
- `src/store/roastStore.ts` — `bridgeIp` (persisted), `setBridgeIp`, `wsStatus` added

**Status dot:** grey = disconnected, orange = connecting, green = connected, red = error.
Dot stays grey until `ArtisanProvider` is wired in (Step 5).

---

## Step 4 — Build ArtisanProvider ✅ DONE

**New file:** `src/engine/artisanProvider.ts`

- Implements `TemperatureProvider` — `getBT/getET/getRoR` return null until connected
- Manages its own WebSocket; auto-reconnects after 3s on drop
- Status changes reported via callback → drives the Settings dot (Step 3)
- `disconnect()` clears values immediately → engine falls back to manual mode
- Malformed bridge frames are silently skipped; last known values retained

---

## Step 5 — Wire ArtisanProvider into the store ✅ DONE

**File:** `src/store/roastStore.ts`

- `ArtisanProvider` singleton at module level; status callback drives `wsStatus`
- `setBridgeIp` connects/disconnects immediately; `loadSettings` reconnects on restart
- `btLive`, `etLive`, `rorLive` added to store state, updated every 1s timer tick
- Live BT/ET/RoR updated every 1s timer tick (display + alerts only)
- Engine never auto-advances — user must confirm every step via action buttons
- Manual advancement fully functional as fallback when bridge is disconnected

---

## Step 6 — Display live data in RoastScreen ✅ DONE

**File:** `src/screens/RoastScreen.tsx` (major redesign)

- Two-header layout: phase header (skinny, phase-coloured) + live bar (always visible)
- Live bar shows: effective target + ETA | live BT with coloured RoR arrows | elapsed time
- `effectiveTarget` logic: if BT < current trigger → target is current; if BT > current and next is higher → target is next
- Temperature-based alerts: `clamp(minF, gap × pct%, maxF)` — fires only when `isRising` (rorLive > 0)
- RoR arrows: red ▲ rising, blue ▼ dropping
- LIVE / MANUAL mode indicator in header
- Action buttons replace checkboxes: amber (locked) → green (ready, BT risen to trigger) → red blink (overdue, rising 5°F+ past)
- Latch: button stays unlocked once BT rises from below to trigger; requires seen-below-first to prevent false unlock after Charge
- Tapping last action button advances to next step (no separate Next button)
- Two-tier alerts: clave (normal) for all steps + loud original at 400°F for Charge only
- Default sound changed to clave; time-based alerts are visual-only (no sound/haptic)
- Progressive live bar colors: target pulses green (approaching) → solid green (matched); BT blinks amber → solid green

**Also in this step:**
- `src/engine/roastEngine.ts` — `evaluateTemperature` fixed to advance ONE step at a time with `areActionsComplete` gate
- `src/screens/SettingsScreen.tsx` — added LIVE TEMP ALERT section (min °F, max °F, % of gap pill selectors)
- `src/store/roastStore.ts` — added `tempAlertMinF/MaxF/Pct` with setters + AsyncStorage persistence
- `src/screens/RecipeScreen.tsx` — fixed setState-during-render (moved `goBack` to `useEffect`)
- `bridge/proto/mock_artisan.js` — realistic E46 S-curve: 370→405 pre-charge, 405→165 drop, 165→410 sigmoid climb

---

## Step 7 — Windows laptop testing

Only after Steps 2–6 are working on Mac:
- Copy `bridge.py` (or build `.exe`) to the Windows Artisan laptop
- Configure Artisan WebSocket event (see `bridge/DEVELOPER.md`)
- Connect iPhone to roastery Wi-Fi
- Enter Windows laptop's local IP in app Settings
- Do a dry run with Artisan running (no actual roast)

---

## Nice-to-have / later
- [ ] Assign static IP to Windows laptop in router (avoids re-entering IP)
- [ ] Build `.exe` version of bridge for Windows (no Python install required)
- [ ] RoR chart / historical comparison (Phase 2 scope, can piggyback on live data)
- [ ] Auto-trigger events when BT hits threshold (full Phase 3 automation)
