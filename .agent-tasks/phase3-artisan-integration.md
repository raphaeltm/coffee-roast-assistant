# Phase 3 — Artisan Integration Plan
## Coffee Roast Assistant · E46 Roastery

_Researched 2026-05-26. Sources: Artisan official docs, GitHub OSS projects._

---

## TL;DR Recommendation

**Use WebSocket.** Build a small Python bridge script on the Windows Artisan laptop. Artisan pushes BT/ET/RoR to the bridge via timed Event commands. The bridge relays a clean JSON stream to the iPhone over Wi-Fi. Zero changes to the existing roasting workflow.

---

## What Artisan Actually Supports

Three integration protocols are documented:

| Protocol | Direction | Complexity | Verdict |
|---|---|---|---|
| **WebSocket** | Artisan → external server | Low | ✅ Best fit |
| **MQTT** | Pub/Sub via broker | Medium-high | Too much infra |
| **TC4 Serial** | Hardware → Artisan | Low | Wrong direction (feeds data INTO Artisan, not out) |

### Why WebSocket wins

Artisan's WebSocket integration works like this:
- You run a WebSocket **server** (the bridge) on the same Windows laptop
- Artisan connects to it as a client and sends data via `send()` calls in the Events tab
- Unsolicited push messages are already defined: `{"Message":"CHARGE"}`, `{"Message":"DROP"}`, etc.
- Temperature placeholders are substituted by Artisan before sending: `{BT}`, `{ET}`, `{t}` (elapsed)

Example payload Artisan can send every second:
```json
{ "bt": 318.2, "et": 592.1, "t": 427 }
```

The bridge receives this, adds RoR (computed from BT delta), and broadcasts to the iPhone.

### Why MQTT is overkill for now

MQTT requires a broker (Mosquitto or cloud), custom JMESPath expressions for every field, and no predefined topic structure. More moving parts = more failure modes at the roaster. Skip for now, revisit if multi-device monitoring is needed later.

---

## Recommended Architecture

```
Diedrich IR-12
      ↓  (thermocouples)
Artisan on Windows laptop
      ↓  (WebSocket client → sends {BT}, {ET}, {t} every 1s)
bridge.py  ← runs on same Windows laptop, port 8765
      ↓  (WebSocket server → broadcasts clean JSON)
iPhone app  ← connects over Wi-Fi
```

### What the bridge does

- WebSocket server (Python `websockets` library, ~80 lines)
- Receives Artisan telemetry, computes RoR from BT delta
- Broadcasts to all connected clients (iPhone app)
- Gracefully handles disconnect/reconnect on both sides
- Runs as a background script — no UI needed

### What the iPhone app does

- Connects to `ws://<laptop-ip>:8765` on same Wi-Fi
- Receives `{ bt, et, ror, t }` every second
- Feeds into a new `ArtisanTemperatureProvider` implementing the existing `TemperatureProvider` interface
- Roast Engine drives event progression from temperature, not timer

---

## TemperatureProvider Abstraction (do this first)

Before writing any bridge code, add this interface to the engine. It decouples the app from the data source and makes testing trivial.

```typescript
// src/engine/temperatureProvider.ts

export interface TemperatureProvider {
  getBT(): number | null;   // Bean Temperature
  getET(): number | null;   // Environmental Temperature
  getRoR(): number | null;  // Rate of Rise (°F/min)
  getElapsed(): number;     // Seconds since roast start
}
```

Concrete implementations:
- `ManualProvider` — Phase 1 (current). Returns `null` for BT/ET/RoR; elapsed from store timer.
- `ArtisanProvider` — Phase 3. Reads from WebSocket bridge.

The Roast Engine already has `evaluateTemperature()` — it just needs BT piped in from the provider rather than hardcoded.

---

## Predictive Pre-Alerts (Phase 3 upgrade)

Once live BT + RoR are available, replace fixed-time pre-alerts with predicted arrival:

```typescript
// seconds until BT reaches trigger temperature
const secondsUntilTrigger = (targetBT - currentBT) / (ror / 60);
```

This is far more accurate than the current estimated-time countdown. A step that normally takes 5 minutes could arrive in 3 minutes on a fast roast day — the predictive alert catches it. Fixed timers don't.

---

## Existing OSS Reference Projects

| Repo | What it does | Relevance |
|---|---|---|
| [Croaster](https://github.com/IiemB/Croaster) | ESP32 → Artisan via WebSocket + BLE | Architecture reference for WebSocket relay |
| [TC4-WB](https://github.com/sakunamary/TC4-WB) | ESP32 → Artisan, BT every 750ms | Update frequency reference |
| [RoboPopc](https://github.com/bitwisetech/popc) | Arduino + MQTT + Artisan serial | MQTT pattern reference if needed later |

None of these do exactly what we need (read FROM Artisan and relay to mobile), but the WebSocket patterns are directly applicable.

---

## Implementation Plan

### Step 1 — TemperatureProvider abstraction ✅ (done 2026-05-27)
- `src/engine/temperatureProvider.ts` — `TemperatureProvider` interface + `ManualProvider`
- `evaluateTemperature()` annotated with Phase 3 hookup point
- `ManualProvider` returns nulls — current behaviour unchanged

### Step 2 — Bridge script (Python, ~80 lines)
- `bridge/bridge.py` — WebSocket server on port 8765
- Receives Artisan push, computes RoR, broadcasts JSON
- `bridge/README.md` — setup instructions for Windows (pip install, run on startup)
- Artisan configuration guide (which Event tab settings to change)

### Step 3 — ArtisanProvider in the app
- Connects to bridge WebSocket
- Exposes `getBT()`, `getET()`, `getRoR()`, `getElapsed()`
- Falls back to `ManualProvider` if connection drops
- Settings screen: bridge IP address + port (default `192.168.x.x:8765`)

### Step 4 — Predictive pre-alerts
- Replace `evaluatePreAlert()` timer logic with RoR-based prediction
- Keep fixed-timer as fallback when RoR is unavailable

---

## Safety Constraints (non-negotiable)

- The bridge is **read-only**. It never writes to Artisan.
- The app **never auto-advances** a roast step. Temperature is a signal, not a trigger.
- If Wi-Fi drops, the app falls back to manual mode silently. Roast continues.
- The Windows laptop roasting setup is **unchanged**.

---

## Open Questions Before Phase 3 Starts

1. **Is the Diedrich IR-12 already connected to Artisan via TC4 or direct serial?** This affects whether we can add WebSocket events without disturbing the existing device configuration.
2. **Does the Windows laptop stay on the roastery Wi-Fi during roasts?** Bridge requires laptop + iPhone on same network.
3. **Is Python already installed on the Windows laptop?** Alternative: Node.js bridge.
4. **What Wi-Fi setup is at the roastery?** Static IP for the laptop would simplify the iPhone's connection config.
