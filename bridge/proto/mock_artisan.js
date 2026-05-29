// Mock Artisan — simulates Artisan's WebSocket client behaviour.
//
// Artisan's only role in the bridge architecture is: connect to /artisan and
// push a JSON frame {bt, et, t} once per (simulated) second. This reproduces
// that wire contract faithfully, including the "-"/""/null values Artisan
// emits for a channel before probes settle.
//
// Env:
//   URL                ws endpoint            (default ws://127.0.0.1:8765/artisan)
//   TOKEN              appended as ?token=    (optional)
//   SCENARIO           happy | junk | linear  (default happy)
//   FRAME_INTERVAL_MS  real ms between frames (default 1000)
//   TIME_SCALE         sim seconds per frame  (default 1)
//   SIM_SECONDS        total simulated roast  (default 720)
//   LINEAR_START       linear: start BT °F    (default 200)
//   LINEAR_SLOPE       linear: °F per sim-sec (default 0.5)
//   JUNK_FRAMES        junk: leading bad rows (default 5)

const WebSocket = require("ws");

const SCENARIO = process.env.SCENARIO || "happy";
const FRAME_INTERVAL_MS = Number(process.env.FRAME_INTERVAL_MS || 1000);
const TIME_SCALE = Number(process.env.TIME_SCALE || 1);
const SIM_SECONDS = Number(process.env.SIM_SECONDS || 720);
const LINEAR_START = Number(process.env.LINEAR_START || 200);
const LINEAR_SLOPE = Number(process.env.LINEAR_SLOPE || 0.5);
const JUNK_FRAMES = Number(process.env.JUNK_FRAMES || 5);

let url = process.env.URL || "ws://127.0.0.1:8765/artisan";
if (process.env.TOKEN) url += (url.includes("?") ? "&" : "?") + "token=" + process.env.TOKEN;

// Realistic roast curve: charge hot, drop to a turning point, then climb.
function happyBT(t) {
  const CHARGE = 390, TP = 60, TP_T = 190, DROP = 720, FINISH = 405;
  if (t <= 0) return CHARGE;
  if (t < TP) return CHARGE + (TP_T - CHARGE) * (t / TP);
  return TP_T + (FINISH - TP_T) * Math.pow((t - TP) / (DROP - TP), 0.85);
}

function frameFor(simT, index) {
  if (SCENARIO === "linear") {
    const bt = LINEAR_START + LINEAR_SLOPE * simT;
    return { bt: round1(bt), et: round1(bt + 70), t: simT };
  }
  // junk: first JUNK_FRAMES rows carry the non-numeric values Artisan really
  // emits pre-CHARGE; everything after is a normal roast curve.
  if (SCENARIO === "junk" && index < JUNK_FRAMES) {
    const bad = ["-", "", null];
    return { bt: bad[index % bad.length], et: "-", t: simT };
  }
  const bt = happyBT(simT);
  return { bt: round1(bt), et: round1(Math.min(bt + 70, 620)), t: simT };
}

function round1(x) { return Math.round(x * 10) / 10; }

const ws = new WebSocket(url);
let index = 0;

ws.on("open", () => {
  console.error(`[mock_artisan] connected ${url} scenario=${SCENARIO}`);
  const timer = setInterval(() => {
    const simT = index * TIME_SCALE;
    if (simT > SIM_SECONDS) {
      clearInterval(timer);
      ws.close();
      return;
    }
    ws.send(JSON.stringify(frameFor(simT, index)));
    index++;
  }, FRAME_INTERVAL_MS);
});

ws.on("close", () => {
  console.error(`[mock_artisan] done — sent ${index} frames`);
  process.exit(0);
});
ws.on("error", (e) => {
  console.error(`[mock_artisan] error: ${e.message}`);
  process.exit(1);
});
