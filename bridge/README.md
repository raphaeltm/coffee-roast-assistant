# E46 Roast Assistant — Artisan Bridge

A small background script that reads live temperature data from Artisan and
streams it to the iPhone roast assistant app over Wi-Fi.

---

## What this is

A single Python script (`bridge.py`) that runs on the same Windows laptop as
Artisan. It:

- Opens a local WebSocket server on port 8765
- Receives temperature data that Artisan pushes to it
- Relays that data to the iPhone app

That is all it does. It is a passive relay. It cannot control Artisan, cannot
control the roaster, and has no way to affect the roast in any way.

---

## What this is NOT

- Not a plugin or extension for Artisan
- Not a Windows service or startup program (unless you choose to make it one)
- Not connected to the internet
- Not able to send any data out of your local network
- Not able to write to Artisan or modify any roast data
- Not able to control the Diedrich or any roaster hardware

---

## Risk assessment

### To the roaster and roasting process: Zero risk

The bridge cannot write to Artisan, cannot control hardware, and cannot
interfere with the roast. If the bridge crashes, freezes, or is closed, Artisan
continues operating exactly as before. The Diedrich is unaffected.

**Worst case:** The iPhone app loses its temperature feed and falls back to
manual mode. You continue the roast normally using Artisan as you always have.

### To the Windows laptop: Very low risk

The bridge is a plain Python script. It:
- Does not modify the Windows registry
- Does not install a Windows service
- Does not modify any system files
- Does not change network settings
- Opens one local network port (8765) while running — closed when the script stops

### To Artisan: Very low risk

You will add a timed event in Artisan's Events tab that sends temperature data
to the bridge every second. This is a standard Artisan configuration — the same
mechanism used by many professional setups. It does not modify Artisan's core
behaviour. To undo it: delete the event. Artisan reverts to exactly as before.

---

## What needs to be installed on the Windows laptop

### Option A — Python (recommended, transparent)

1. **Python 3.10 or newer** — downloaded from https://python.org
   - Installer is signed by the Python Software Foundation
   - Choose "Add Python to PATH" during install
   - Takes about 2 minutes
2. **One Python library:** `websockets`
   - Installed with one command: `pip install websockets`
   - This library has no dependencies and does one thing: WebSocket communication

Total footprint: ~50 MB for Python + <1 MB for the library.

### Option B — Single executable (no Python install required)

We can package `bridge.py` into a single `.exe` file using PyInstaller. You
would receive one file, double-click it, and the bridge runs. Nothing else is
installed. To remove it: delete the file.

**This is the safest option for a machine where you want minimal changes.**
The .exe is self-contained and leaves no trace when deleted.

_Note: The .exe will be unsigned (no code-signing certificate), so Windows
Defender SmartScreen may show a warning on first run. You click "More info →
Run anyway". This is normal for internally-distributed tools._

---

## How to run it

```
python bridge.py
```

A small console window appears showing the bridge status:

```
12:00:00 [bridge] E46 Roast Assistant — Artisan Bridge
12:00:00 [bridge] Artisan  -> ws://localhost:8765/artisan
12:00:00 [bridge] App      -> ws://<this-laptop-ip>:8765/
12:00:00 [bridge] RoR window: 15s
12:00:00 [bridge] listening on ws://0.0.0.0:8765  (Ctrl+C to stop)
12:00:05 [bridge] Artisan connected (('127.0.0.1', 54012))
12:00:07 [bridge] app client connected — 1 client(s)
```

Close the console window (or press Ctrl+C) to stop the bridge. Nothing persists.

---

## Artisan configuration required

In Artisan, you will add one timed event (under Config → Events) that sends
BT and ET to the bridge every second:

```
send({"bt": {BT}, "et": {ET}, "t": {t}})
```

This uses Artisan's built-in `send()` command with its standard temperature
placeholders. It is the same mechanism documented in Artisan's official
WebSocket guide at https://artisan-scope.org/devices/websockets/.

**To undo:** Delete this event from the Events tab. Artisan is back to its
previous state.

---

## Network requirements

- The Windows laptop and the iPhone must be on the same Wi-Fi network
- The bridge only communicates within your local network — no internet required
- You will enter the laptop's local IP address in the iPhone app settings once
  (e.g. `192.168.1.42`) — it only changes if the laptop gets a new IP address

**Tip:** Assign a static local IP to the laptop in your router settings to
avoid needing to update the IP in the app.

**Remote access (off the roastery Wi-Fi) or a stable TLS address?** See
[REMOTE_ACCESS.md](REMOTE_ACCESS.md) — covers Tailscale Funnel/Serve, Cloudflare
Tunnel, and the shared-secret (`BRIDGE_TOKEN`) auth.

---

## Complete removal

To remove everything:

1. Delete `bridge.py` (or the `.exe` if you used Option B)
2. In Artisan: delete the timed event added during setup
3. If you installed Python: uninstall it from Windows Settings → Apps

After step 2, Artisan is exactly as it was before. After step 3, the laptop
is exactly as it was before.

---

## Compatibility

- Windows 10 or 11
- Artisan version 2.0 or newer (WebSocket support added in 2.0)
- Tested with Diedrich IR-12 + Artisan on Windows

---

## Summary for IT / approval

> A single-file Python script that opens a read-only local WebSocket server
> on port 8765. It receives temperature telemetry from Artisan (which already
> supports this via its built-in Events system) and relays it to an iPhone app
> on the same Wi-Fi network. It cannot write to Artisan, cannot control any
> hardware, and stops completely when the console window is closed. It requires
> Python 3.10+ and the `websockets` library, or can be delivered as a
> self-contained .exe with no installation required. Fully reversible.
