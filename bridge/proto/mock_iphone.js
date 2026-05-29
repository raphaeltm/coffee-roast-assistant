// Mock iPhone / Expo app — subscribes to the bridge and validates the stream.
//
// Written in JS so it mirrors the Expo app's WebSocket semantics. It listens
// for RUN_MS, validating every frame, then prints a machine-readable
// "SUMMARY <json>" line the test orchestrator parses.
//
// Env:
//   URL                  ws endpoint           (default ws://127.0.0.1:8765/)
//   TOKEN                appended as ?token=   (optional)
//   RUN_MS               how long to listen    (default 5000)
//   DISCONNECT_AFTER_MS  close early (for fan-out tests)  (optional)
//   LABEL                tag in logs           (default app)

const WebSocket = require("ws");

const RUN_MS = Number(process.env.RUN_MS || 5000);
const DISCONNECT_AFTER_MS = process.env.DISCONNECT_AFTER_MS
  ? Number(process.env.DISCONNECT_AFTER_MS) : null;
const LABEL = process.env.LABEL || "app";

let url = process.env.URL || "ws://127.0.0.1:8765/";
if (process.env.TOKEN) url += (url.includes("?") ? "&" : "?") + "token=" + process.env.TOKEN;

const summary = {
  label: LABEL,
  received: 0,
  malformed: 0,
  missingFields: 0,
  withBt: 0,
  withRor: 0,
  nullBt: 0,
  firstRor: null,
  lastRor: null,
  lastFrame: null,
  connected: false,
  errored: false,
};

const ws = new WebSocket(url);

ws.on("open", () => {
  summary.connected = true;
  console.error(`[mock_iphone:${LABEL}] connected ${url}`);
  if (DISCONNECT_AFTER_MS !== null) {
    setTimeout(() => {
      console.error(`[mock_iphone:${LABEL}] disconnecting early`);
      ws.close();
    }, DISCONNECT_AFTER_MS);
  }
});

ws.on("message", (raw) => {
  summary.received++;
  let frame;
  try {
    frame = JSON.parse(raw.toString());
  } catch {
    summary.malformed++;
    return;
  }
  const hasKeys = ["bt", "et", "t", "ror"].every((k) => k in frame);
  if (!hasKeys) summary.missingFields++;
  if (typeof frame.bt === "number") summary.withBt++;
  if (frame.bt === null) summary.nullBt++;
  if (typeof frame.ror === "number") {
    summary.withRor++;
    if (summary.firstRor === null) summary.firstRor = frame.ror;
    summary.lastRor = frame.ror;
  }
  summary.lastFrame = frame;
});

ws.on("error", (e) => {
  summary.errored = true;
  console.error(`[mock_iphone:${LABEL}] error: ${e.message}`);
});

function finish() {
  try { ws.close(); } catch {}
  console.log("SUMMARY " + JSON.stringify(summary));
  process.exit(0);
}

setTimeout(finish, RUN_MS);
