# Bridge prototype — end-to-end test harness

Runs the real `bridge.py` against a **simulated Artisan** and a **simulated app
client**, so the relay can be tested with no roaster and no iPhone. Artisan's
only role in the architecture is a WebSocket client pushing `{bt, et, t}` once
per second to `/artisan`; that wire contract is what the mock reproduces.

## Run

```
npm install
node run-tests.js
```

The bridge itself is Python and needs the `websockets` library:

```
python3 -m venv .venv && .venv/bin/pip install websockets
```

`run-tests.js` expects the interpreter at `/tmp/bridgevenv/bin/python` — adjust
the `PY` constant at the top of the file if your venv lives elsewhere.

## Files

| File | Role |
|------|------|
| `mock_artisan.js` | WebSocket client → `/artisan`. Scenarios: `happy` (realistic roast curve), `junk` (`"-"`/`""`/`null` pre-CHARGE values), `linear` (known slope, for RoR checks). |
| `mock_iphone.js` | WebSocket subscriber mirroring the Expo app. Validates frames and prints a machine-readable `SUMMARY` line. |
| `run-tests.js` | Orchestrator: spawns the bridge + mocks per scenario and asserts. |
| `bridge_original.py` | Frozen snapshot of the pre-fix bridge, used only to demonstrate the path-routing regression in test T2. |

## Scenarios

| Test | What it proves |
|------|----------------|
| T1 | Happy-path frames flow end-to-end |
| T2 | The original path-routing bug (app receives 0 frames) vs the fix (data flows) |
| T3 | A junk/non-numeric reading is coerced to `null` and never kills the feed |
| T4 | RoR magnitude is correct, validated in real time against a known slope |
| T5 | Multi-client fan-out survives a mid-stream disconnect |

Both mocks are also runnable standalone (configured via environment variables —
see the header of each file) for manual/interactive testing.
