"""
E46 Roast Assistant — Artisan Bridge

A passive WebSocket relay that runs on the same laptop as Artisan. Artisan
connects as a client and pushes temperature frames; the bridge computes Rate of
Rise and fans the data out to one or more app clients (iPhone). It never writes
to Artisan and cannot affect the roast.

    pip install websockets
    python bridge.py

Two WebSocket paths on one port:
    ws://localhost:8765/artisan   ← Artisan connects here (configured in Artisan)
    ws://<laptop-ip>:8765/        ← app connects here (receive-only)

Configuration (all optional, via environment variables):
    BRIDGE_HOST        bind address          (default 0.0.0.0)
    BRIDGE_PORT        port                  (default 8765)
    BRIDGE_TOKEN       shared secret; if set, clients must pass ?token=...
    BRIDGE_ROR_WINDOW  RoR window in seconds (default 15)
    BRIDGE_LOG_FILE    if set, also append logs to this file
"""

import asyncio
import json
import logging
import os
import time
from collections import deque
from urllib.parse import urlsplit, parse_qs

import websockets
from websockets.exceptions import ConnectionClosed

HOST = os.environ.get("BRIDGE_HOST", "0.0.0.0")
PORT = int(os.environ.get("BRIDGE_PORT", "8765"))
TOKEN = os.environ.get("BRIDGE_TOKEN") or None
ROR_WINDOW_SECONDS = float(os.environ.get("BRIDGE_ROR_WINDOW", "15"))
ROR_MIN_SPAN_SECONDS = 2.0  # need at least this much span before reporting RoR
ARTISAN_PATH = "/artisan"

# Keepalive: reap half-open TCP connections (e.g. Wi-Fi drop) without waiting
# on the OS. websockets sends a ping every interval and drops the peer if no
# pong arrives within the timeout.
PING_INTERVAL = 20
PING_TIMEOUT = 20

# Bound each client's outbound queue so a slow/stalled app client can never
# apply backpressure to the Artisan ingest path. Oldest frames are dropped.
CLIENT_QUEUE_MAX = 10

# A large decrease in Artisan's elapsed counter means a new roast started
# (CHARGE reset). Clear RoR history so the new roast doesn't inherit stale beans.
ELAPSED_RESET_DROP = 5


# --------------------------------------------------------------------------- #
# Logging
# --------------------------------------------------------------------------- #
log = logging.getLogger("bridge")


def _setup_logging() -> None:
    log.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s [bridge] %(message)s", "%H:%M:%S")
    stream = logging.StreamHandler()
    stream.setFormatter(fmt)
    log.addHandler(stream)
    log_file = os.environ.get("BRIDGE_LOG_FILE")
    if log_file:
        fh = logging.FileHandler(log_file)
        fh.setFormatter(fmt)
        log.addHandler(fh)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def to_float(value) -> float | None:
    """
    Coerce an incoming value to float, or return None if it isn't a usable
    number. Artisan emits "-", "", or null for a channel before probes settle
    or on a read error — those must never crash the relay.
    """
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        f = float(value)
    elif isinstance(value, str):
        try:
            f = float(value.strip())
        except ValueError:
            return None
    else:
        return None
    if f != f or f in (float("inf"), float("-inf")):  # NaN / inf guard
        return None
    return f


def request_path(websocket) -> str | None:
    """
    Resolve the request path across websockets versions.

    Modern asyncio API (websockets >= 13) exposes it as ``websocket.request.path``;
    the legacy API exposed ``websocket.path``. We never fall back to a default
    path — an unresolved path is a hard error, not a silent route to the app
    handler (which is the bug that made the first version look healthy while
    relaying nothing).
    """
    req = getattr(websocket, "request", None)
    if req is not None and getattr(req, "path", None) is not None:
        return req.path
    return getattr(websocket, "path", None)


def check_token(path: str) -> bool:
    """If BRIDGE_TOKEN is set, require a matching ?token= query parameter."""
    if TOKEN is None:
        return True
    query = parse_qs(urlsplit(path).query)
    return query.get("token", [None])[0] == TOKEN


# --------------------------------------------------------------------------- #
# Bridge state
# --------------------------------------------------------------------------- #
class Bridge:
    def __init__(self) -> None:
        # client websocket -> outbound asyncio.Queue
        self.clients: dict[object, asyncio.Queue] = {}
        # (monotonic_time, bt) samples within the RoR window
        self.bt_history: deque = deque()
        self.last_elapsed: float | None = None
        self.artisan: object | None = None

    # -- RoR ----------------------------------------------------------------- #
    def reset_history(self, reason: str) -> None:
        if self.bt_history:
            log.info("RoR history cleared (%s)", reason)
        self.bt_history.clear()
        self.last_elapsed = None

    def record_bt(self, bt: float) -> None:
        now = time.monotonic()
        self.bt_history.append((now, bt))
        cutoff = now - ROR_WINDOW_SECONDS
        while len(self.bt_history) > 2 and self.bt_history[0][0] < cutoff:
            self.bt_history.popleft()

    def compute_ror(self) -> float | None:
        """RoR in °F/min via least-squares slope over the time-bounded window."""
        n = len(self.bt_history)
        if n < 2:
            return None
        t0 = self.bt_history[0][0]
        span = self.bt_history[-1][0] - t0
        if span < ROR_MIN_SPAN_SECONDS:
            return None
        xs = [t - t0 for t, _ in self.bt_history]
        ys = [bt for _, bt in self.bt_history]
        mean_x = sum(xs) / n
        mean_y = sum(ys) / n
        denom = sum((x - mean_x) ** 2 for x in xs)
        if denom == 0:
            return None
        slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / denom
        return round(slope * 60, 1)  # per-second -> per-minute

    # -- Fan-out ------------------------------------------------------------- #
    def broadcast(self, payload: str) -> None:
        """Enqueue to every client. Never blocks; drops oldest if a queue is full."""
        for queue in list(self.clients.values()):
            if queue.full():
                try:
                    queue.get_nowait()  # drop oldest
                except asyncio.QueueEmpty:
                    pass
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                pass


bridge = Bridge()


# --------------------------------------------------------------------------- #
# Connection handlers
# --------------------------------------------------------------------------- #
async def handle_artisan(websocket) -> None:
    """Artisan pushes frames here. Receive-only from our side."""
    addr = websocket.remote_address
    # Only one Artisan should feed the bridge. If another connects, adopt the
    # newest and drop the old one so a stale half-open socket can't lock us out.
    if bridge.artisan is not None and bridge.artisan is not websocket:
        log.warning("second Artisan connection (%s) — replacing previous", addr)
        try:
            await bridge.artisan.close(code=1012, reason="replaced")
        except Exception:
            pass
    bridge.artisan = websocket
    bridge.reset_history("Artisan connected")
    log.info("Artisan connected (%s)", addr)
    try:
        async for raw in websocket:
            try:
                data = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                continue
            if not isinstance(data, dict):
                continue

            bt = to_float(data.get("bt"))
            et = to_float(data.get("et"))
            t = to_float(data.get("t"))

            # New-roast detection: elapsed jumped backwards -> CHARGE reset.
            if t is not None:
                if bridge.last_elapsed is not None and t < bridge.last_elapsed - ELAPSED_RESET_DROP:
                    bridge.reset_history("roast reset (elapsed went backwards)")
                bridge.last_elapsed = t

            if bt is not None:
                bridge.record_bt(bt)

            payload = json.dumps({
                "bt": bt,
                "et": et,
                "t": t,
                "ror": bridge.compute_ror(),
            })
            bridge.broadcast(payload)
    except ConnectionClosed:
        pass
    except Exception as exc:  # never let one bad frame kill the relay
        log.warning("Artisan handler error: %r", exc)
    finally:
        if bridge.artisan is websocket:
            bridge.artisan = None
        log.info("Artisan disconnected (%s)", addr)


async def handle_app(websocket) -> None:
    """App client subscribes here. We push frames from its dedicated queue."""
    queue: asyncio.Queue = asyncio.Queue(maxsize=CLIENT_QUEUE_MAX)
    bridge.clients[websocket] = queue
    log.info("app client connected — %d client(s)", len(bridge.clients))
    try:
        while True:
            payload = await queue.get()
            await websocket.send(payload)
    except ConnectionClosed:
        pass
    finally:
        bridge.clients.pop(websocket, None)
        log.info("app client disconnected — %d client(s)", len(bridge.clients))


async def router(websocket) -> None:
    """Route by URL path; reject anything we can't resolve or authenticate."""
    path = request_path(websocket)
    if path is None:
        log.warning("could not resolve request path — rejecting %s", websocket.remote_address)
        await websocket.close(code=1011, reason="no path")
        return
    if not check_token(path):
        log.warning("bad/missing token — rejecting %s", websocket.remote_address)
        await websocket.close(code=4001, reason="unauthorized")
        return

    route = urlsplit(path).path
    if route == ARTISAN_PATH:
        await handle_artisan(websocket)
    else:
        await handle_app(websocket)


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #
async def main() -> None:
    _setup_logging()
    log.info("E46 Roast Assistant — Artisan Bridge")
    log.info("Artisan  -> ws://localhost:%d%s", PORT, ARTISAN_PATH)
    log.info("App      -> ws://<this-laptop-ip>:%d/", PORT)
    if TOKEN:
        log.info("token auth ENABLED (clients must pass ?token=...)")
    log.info("RoR window: %.0fs", ROR_WINDOW_SECONDS)

    try:
        server = await websockets.serve(
            router, HOST, PORT,
            ping_interval=PING_INTERVAL,
            ping_timeout=PING_TIMEOUT,
        )
    except OSError as exc:
        log.error("could not bind %s:%d — %s", HOST, PORT, exc.strerror or exc)
        log.error("is another copy of the bridge already running?")
        raise SystemExit(1)

    log.info("listening on ws://%s:%d  (Ctrl+C to stop)", HOST, PORT)
    async with server:
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[bridge] Stopped.")
