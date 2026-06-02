"""
E46 Roast Assistant — Artisan Bridge
Option A: Run directly with Python

Requirements:
    pip install websockets

Usage:
    python bridge.py

Two WebSocket paths:
    ws://localhost:8765/artisan  ← Artisan connects here (configured in Artisan Events tab)
    ws://<laptop-ip>:8765/       ← iPhone app connects here
"""

import asyncio
import json
import time
import websockets
from collections import deque

PORT = 8765

# All connected iPhone clients (there may be more than one)
iphone_clients: set = set()

# Rolling BT history for Rate of Rise calculation (last 60 seconds)
bt_history: deque = deque(maxlen=60)


def compute_ror() -> float | None:
    """
    Compute Rate of Rise in °F/min from the BT history buffer.
    Uses oldest vs newest reading in the buffer for a smooth value.
    Returns None if not enough data yet.
    """
    if len(bt_history) < 2:
        return None
    oldest_time, oldest_bt = bt_history[0]
    newest_time, newest_bt = bt_history[-1]
    elapsed = newest_time - oldest_time
    if elapsed < 2:
        return None
    ror = (newest_bt - oldest_bt) / elapsed * 60  # convert per-second to per-minute
    return round(ror, 1)


async def handle_artisan(websocket):
    """
    Artisan connects here and pushes temperature data every second.
    We receive it, compute RoR, then broadcast to all iPhone clients.
    """
    addr = websocket.remote_address
    print(f"[bridge] Artisan connected  ({addr})")
    try:
        async for raw in websocket:
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue  # ignore malformed messages

            bt = data.get("bt")
            et = data.get("et")
            t  = data.get("t")

            # Update BT history for RoR
            if bt is not None:
                bt_history.append((time.monotonic(), float(bt)))

            payload = json.dumps({
                "bt":  bt,
                "et":  et,
                "t":   t,
                "ror": compute_ror(),
            })

            # Broadcast to all connected iPhone clients
            if iphone_clients:
                results = await asyncio.gather(
                    *[c.send(payload) for c in iphone_clients],
                    return_exceptions=True,
                )
                # Remove any clients that errored (disconnected)
                for client, result in zip(list(iphone_clients), results):
                    if isinstance(result, Exception):
                        iphone_clients.discard(client)

    except websockets.ConnectionClosed:
        pass
    finally:
        print(f"[bridge] Artisan disconnected ({addr})")


async def handle_iphone(websocket):
    """
    iPhone app connects here and waits for the broadcast stream.
    No messages are expected from the iPhone — this is receive-only.
    """
    iphone_clients.add(websocket)
    print(f"[bridge] iPhone  connected  — {len(iphone_clients)} client(s)")
    try:
        await websocket.wait_closed()
    finally:
        iphone_clients.discard(websocket)
        print(f"[bridge] iPhone  disconnected — {len(iphone_clients)} client(s)")


async def router(websocket):
    """Route incoming connections by path."""
    path = getattr(websocket, "path", "/")
    if path == "/artisan":
        await handle_artisan(websocket)
    else:
        await handle_iphone(websocket)


async def main():
    print(f"[bridge] ─────────────────────────────────────────")
    print(f"[bridge] E46 Roast Assistant — Artisan Bridge")
    print(f"[bridge] ─────────────────────────────────────────")
    print(f"[bridge] Artisan  → ws://localhost:{PORT}/artisan")
    print(f"[bridge] iPhone   → ws://<this-laptop-ip>:{PORT}/")
    print(f"[bridge] ─────────────────────────────────────────")
    print(f"[bridge] Waiting for connections... (Ctrl+C to stop)")

    async with websockets.serve(router, "0.0.0.0", PORT):
        await asyncio.Future()  # run until Ctrl+C


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[bridge] Stopped.")
