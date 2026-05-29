# Bridge — Developer Brief
## E46 Roast Assistant · Artisan Integration

This document covers everything a developer needs to deploy and test the bridge
on the Windows roasting laptop. Two deployment options are described.

---

## What the bridge does (one paragraph)

`bridge.py` is a WebSocket server that runs on the Windows Artisan laptop.
Artisan connects to it as a client and pushes `{BT}`, `{ET}`, and `{t}` every
second via a one-line event in Artisan's Events tab. The bridge receives that
data, computes Rate of Rise (RoR) from the BT delta, and broadcasts the full
payload to any connected iPhone app clients. It is a passive relay — it never
writes to Artisan and cannot affect the roast in any way.

---

## Data flow

```
Artisan (Windows, client)
    → ws://localhost:8765/artisan
        → bridge.py (server, same laptop)
            → ws://<laptop-ip>:8765/
                → iPhone app (client, same Wi-Fi)
```

Artisan and the iPhone use separate WebSocket paths so the bridge can handle
them differently — Artisan is a sender, iPhone is a receiver.

---

## Broadcast payload (every ~1 second)

```json
{
  "bt":  318.2,
  "et":  592.1,
  "t":   427,
  "ror": 11.3
}
```

| Field | Source | Unit |
|-------|--------|------|
| `bt`  | Artisan `{BT}` placeholder | °F |
| `et`  | Artisan `{ET}` placeholder | °F |
| `t`   | Artisan `{t}` placeholder (elapsed) | seconds |
| `ror` | Least-squares slope over a time window (default 15s) | °F/min |

Any field is `null` if Artisan did not send it, the value was non-numeric
(Artisan emits `"-"`/`""` for a channel before probes settle), or there isn't
yet enough data to compute it. The relay never crashes on a bad field.

---

## Configuration (optional environment variables)

| Variable | Default | Purpose |
|----------|---------|---------|
| `BRIDGE_HOST` | `0.0.0.0` | Bind address |
| `BRIDGE_PORT` | `8765` | Port |
| `BRIDGE_TOKEN` | _(unset)_ | If set, clients must connect with `?token=...` |
| `BRIDGE_ROR_WINDOW` | `15` | RoR window in seconds |
| `BRIDGE_LOG_FILE` | _(unset)_ | If set, also append logs to this file |

RoR history is cleared automatically when Artisan reconnects or when a new
roast starts (detected by the elapsed counter resetting), so one roast never
inherits the previous roast's beans temperature.

---

## Option A — Run as Python script

### Requirements
- Python 3.10 or newer (https://python.org — check "Add Python to PATH" during install)
- One library: `pip install websockets`

### Run
```
python bridge.py
```
A console window shows connection status. Close the window to stop the bridge.
Nothing persists after it is closed.

### Uninstall
1. Delete `bridge.py`
2. Optionally: `pip uninstall websockets`
3. Optionally: uninstall Python from Windows Settings → Apps

---

## Option B — Single .exe (no Python install on target machine)

Build the .exe on any machine that has Python installed (does not have to be
the roasting laptop). The .exe can then be copied to the Windows laptop and
run with a double-click.

### Build steps (run once, on your dev machine)

```bash
pip install pyinstaller websockets
pyinstaller --onefile --console --name "E46-Bridge" bridge.py
```

Output: `dist/E46-Bridge.exe` (~8 MB, self-contained)

### Deploy
Copy `dist/E46-Bridge.exe` to the Windows laptop. Double-click to run.
Same console window as Option A.

### Windows Defender / SmartScreen note
Because the .exe is unsigned, Windows may show:
> "Windows protected your PC — Microsoft Defender SmartScreen prevented an
> unrecognized app from starting."

Click **More info → Run anyway**. This appears on first run only and is normal
for internally-distributed, unsigned tools. It is not a security warning about
the code itself — only about the missing code-signing certificate.

If this is a blocker, use Option A (Python script) instead. Python itself is
signed and trusted by Windows.

### Uninstall
Delete the `.exe` file. Nothing else was installed.

---

## Artisan configuration (both options)

These steps are done once in Artisan on the Windows laptop.

### 1. Set up WebSocket endpoint

In Artisan:
```
Config → Ports → WebSocket tab
```

Set:
- **Host:** `localhost`
- **Port:** `8765`
- **Path:** `/artisan`

### 2. Add a timed push event

In Artisan:
```
Config → Events → [add new event]
```

Set:
- **Type:** Timer (fires every N seconds)
- **Interval:** 1 second
- **Action:** WebSocket
- **Command:**
```
send({"bt": {BT}, "et": {ET}, "t": {t}})
```

This uses Artisan's built-in template placeholders. Artisan substitutes live
values before sending. Official reference:
https://artisan-scope.org/devices/websockets/

### Undo
Delete this event from the Events tab. Artisan returns to its previous state.

---

## Testing without the iPhone app

Use any WebSocket client (e.g. the browser extension "Simple WebSocket Client",
or `wscat` in a terminal) to connect to `ws://localhost:8765/` while Artisan is
running. You should see the JSON payload arriving every second.

```bash
# Using wscat (npm install -g wscat)
wscat -c ws://localhost:8765/
```

Expected output:
```
< {"bt": 318.2, "et": 592.1, "t": 427, "ror": 11.3}
< {"bt": 319.1, "et": 593.0, "t": 428, "ror": 11.5}
```

---

## Network: finding the laptop's local IP

The iPhone app needs the laptop's local IP address (e.g. `192.168.1.42`).

On the Windows laptop:
```
Win + R → cmd → ipconfig
```
Look for "IPv4 Address" under the Wi-Fi adapter.

**Recommended:** Assign a static local IP to the laptop in the router's DHCP
settings so this never changes.

---

## Error handling behaviour

| Scenario | Bridge behaviour |
|----------|-----------------|
| Artisan disconnects | Bridge keeps running, waits for reconnect |
| iPhone disconnects | Bridge removes client, keeps streaming |
| Bridge crashes | Artisan continues normally, iPhone falls back to manual mode |
| Wi-Fi drops | Same as iPhone disconnects |

The bridge never affects Artisan's ability to record the roast.

---

## Security

- The bridge listens on `0.0.0.0:8765` — reachable by any device on the same
  network (necessary, since the iPhone is a separate device)
- No internet connection is required or made; nothing leaves the LAN
- Logging is to the console only unless `BRIDGE_LOG_FILE` is set; no roast data
  is persisted

For a closed roastery Wi-Fi, no authentication is needed. If the network is
shared (e.g. with customers), do **not** bind to `127.0.0.1` — that would also
block the iPhone, which is a different machine. Instead, either:

- Set `BRIDGE_TOKEN=<secret>` and have the app connect with `?token=<secret>`
  (the bridge rejects connections without the matching token), and/or
- Firewall port 8765 so only the iPhone's IP can reach it.

---

## Prototype / automated tests

`proto/` contains a Node-based end-to-end harness that runs the real bridge
against simulated Artisan and app clients — no roaster or iPhone required.

```
cd proto && npm install
node run-tests.js
```

It covers: happy-path flow, the path-routing regression (original vs fixed),
junk-reading resilience, RoR accuracy, and multi-client fan-out with a
mid-stream disconnect. See `proto/README.md` for details.

---

## Files

```
bridge/
├── bridge.py       ← the bridge (Option A: run directly)
├── README.md       ← end-user setup guide
├── DEVELOPER.md    ← this file
└── proto/          ← Node end-to-end test harness (mock Artisan + mock app)
    ├── mock_artisan.js
    ├── mock_iphone.js
    ├── run-tests.js
    └── README.md
```
