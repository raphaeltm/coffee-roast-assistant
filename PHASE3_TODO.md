# Phase 3 — Artisan Integration: To-Do
_Temporary reference file — delete after new session is underway_

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

## Step 3 — Add bridge IP setting to the app

**Files to change:**
- `src/screens/SettingsScreen.tsx` — add a text input for bridge IP address (e.g. `192.168.1.42`)
- `src/store/roastStore.ts` — add `bridgeUrl` state, persisted via AsyncStorage
- `src/hooks/useSoundPreference.ts` — no change needed

**UX:** Simple text field in Settings, below the alert threshold. Show connection status dot (grey/green/red).

---

## Step 4 — Build ArtisanProvider

**New file:** `src/engine/artisanProvider.ts`

Implements `TemperatureProvider` interface:
```typescript
export class ArtisanProvider implements TemperatureProvider {
  // Opens WebSocket to bridge URL
  // Parses { bt, et, t, ror } JSON
  // Exposes getBT(), getET(), getRoR()
  // Handles connect/disconnect/reconnect
}
```

**Key decisions to make:**
- Does it manage its own WebSocket, or does the store manage it?
- Reconnect strategy (backoff? immediate retry?)
- What happens in the app when the bridge drops mid-roast? (fall back to manual)

---

## Step 5 — Wire ArtisanProvider into the store

**File:** `src/store/roastStore.ts`

- Replace `ManualProvider` with `ArtisanProvider` when `bridgeUrl` is set
- Add `btLive`, `etLive`, `rorLive` state fields
- Feed live BT into `evaluateTemperature()` in the engine (this is the big moment — auto-advancement)
- Keep manual advancement as fallback when no live data

---

## Step 6 — Display live data in RoastScreen

**File:** `src/screens/RoastScreen.tsx`

Minimum viable display:
- Show live BT in the temperature badge (replacing the static reference temp)
- Highlight when BT is approaching the next threshold
- Show RoR somewhere (small, advisory)

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
