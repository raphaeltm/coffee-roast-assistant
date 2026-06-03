# Phase 3 — Session 2 Handoff
_Pick up here next session. Delete when done._

---

## Branch
`feat/phase-3-artisan` — PR #5 open, targeting `main`

---

## What was completed this session

| Step | Status |
|------|--------|
| 1 — Merge PR #4 (bridge hardening) | ✅ Done |
| 2 — Local pipeline test (5/5 pass) | ✅ Done |
| 3 — Bridge IP + status dot in Settings | ✅ Done, tested on iPhone |
| 4 — `ArtisanProvider` built | ✅ Done |
| 5 — `ArtisanProvider` wired into store | ✅ Done |
| 6 — Live display in RoastScreen | ⚠ Partially built, **NOT working correctly** |

---

## What is broken — Step 6 (RoastScreen live display)

The last test showed the display was "not working quite right". The RoastScreen
changes are committed as `wip(roast-screen)` and need investigation.

**What was added (untested):**
- `isLive` flag: `btLive !== null && wsStatus === 'connected'`
- `showManualWarning` flag: `bridgeIp` set but not connected
- Phase bar: `● LIVE` green pill (live) or `⚠ MANUAL` amber pill (disconnected with IP set)
- Temp badge centre: live BT + RoR when `isLive`, static ref temp when manual
- Temp badge left: next threshold target temp + ETA `~M:SS` when live, time-remaining when manual
- ETA formula: `(nextTriggerTemp - btLive) / rorLive * 60`

**Known unknowns / likely issues:**
1. **Auto-advancement may be too aggressive** — `evaluateTemperature` scans forward through
   ALL events whose threshold has been reached, so if mock_artisan.js sends a high BT it could
   jump multiple events at once. Need to verify the engine handles this gracefully.
2. **ETA display** — `nextEvent` is the next profile event, but during live mode the engine
   may have already advanced past events. Check that `nextEvent` in engineState is the correct
   "next unvisited" event and not stale.
3. **RoR from mock** — `mock_artisan.js` sends simulated RoR; the ETA calculation depends on
   a stable positive RoR. At the start of the roast RoR may be zero or negative (cold bean drop),
   which will hide the ETA (`etaSeconds` returns null when `rorLive <= 0`).
4. **`isLive` condition** — `btLive !== null && wsStatus === 'connected'` should be fine, but
   confirm that `btLive` is being cleared correctly when bridge disconnects mid-roast.

---

## What to do at the start of next session

### 1. Diagnose the display issue
Run the full test setup:
```
Terminal 1: cd bridge && source .venv/bin/activate && python3 bridge.py
Terminal 2: node bridge/proto/mock_artisan.js
Terminal 3: npx expo start
iPhone:     Expo Go → enter Mac's LAN IP in Settings → start a roast
```

Check each of these in order:
- [ ] Does the dot in Settings go green?
- [ ] Does the phase bar show `● LIVE`?
- [ ] Does the big temp number show live BT (should climb from ~300°F to ~420°F over ~2 min)?
- [ ] Does the left panel show the next threshold temp + ETA?
- [ ] Do events auto-advance as BT crosses thresholds?

### 2. Fix what's wrong based on findings
Common fixes likely needed:
- If ETA never shows: check `rorLive` value — add a `console.log` in the store tick
- If events skip or jump: look at `evaluateTemperature` scan logic in `roastEngine.ts`
- If display flickers: `isLive` toggling — check timing of `btLive` updates vs `wsStatus`

### 3. Decide on MANUAL fallback clarity
The MANUAL pill was designed but not tested. Verify it appears correctly when:
- Bridge IP is entered but `bridge.py` is not running
- Bridge disconnects mid-roast

Agreed UX:
- `● LIVE` green — bridge connected, BT flowing
- `⚠ MANUAL` amber — bridge IP set but offline (fallback mode, timer still works)
- Silent — no bridge IP set (behaves like MVP 1/2, no mention of Artisan)

---

## Key files touched this session

| File | What changed |
|------|-------------|
| `src/engine/artisanProvider.ts` | New — WebSocket provider |
| `src/store/roastStore.ts` | Added bridge state, ArtisanProvider wiring, live tick |
| `src/screens/RoastScreen.tsx` | WIP — live display, mode pill, ETA (needs fixing) |
| `src/screens/SettingsScreen.tsx` | Bridge IP input + status dot |
| `bridge/proto/run-tests.js` | Fixed hardcoded Python path |
| `.gitignore` | Added `.venv/` |

---

## After Step 6 is fixed — what remains

- **Step 7:** Windows laptop test with real Artisan (no Mac needed for that step)
- **Nice to have:** RoR chart, assign static IP to Windows laptop, build `.exe` bridge

---

## Test setup reminder

```bash
# Mac's LAN IP (enter this in app Settings)
ipconfig getifaddr en0

# Bridge venv
cd bridge && source .venv/bin/activate && python3 bridge.py

# Mock Artisan (separate terminal)
node bridge/proto/mock_artisan.js

# Run all 5 automated tests (stop bridge.py first)
node bridge/proto/run-tests.js
```
