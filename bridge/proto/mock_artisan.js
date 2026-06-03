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
const SIM_SECONDS = Number(process.env.SIM_SECONDS || 930);
const LINEAR_START = Number(process.env.LINEAR_START || 200);
const LINEAR_SLOPE = Number(process.env.LINEAR_SLOPE || 0.5);
const JUNK_FRAMES = Number(process.env.JUNK_FRAMES || 5);

let url = process.env.URL || "ws://127.0.0.1:8765/artisan";
if (process.env.TOKEN) url += (url.includes("?") ? "&" : "?") + "token=" + process.env.TOKEN;

// Realistic roast curve modelled from real E46 Artisan profiles.
//
// Mirrors the actual workflow:
//   1. Artisan starts at ~370°F (user just turned gas to 5)
//   2. Drum temp rises 370→405°F — user charges beans at 405
//   3. BT drops steeply to turning point ~165°F
//   4. Climb through drying/maillard/development with realistic RoR
//   5. Drop at ~410°F
//
// The climb uses a piecewise RoR model instead of a sigmoid. Real E46 roasts
// show RoR ramping from ~10 to ~25-30°F/min by mid-roast, then declining
// gradually toward first crack. This produces ETA estimates that are
// reasonably accurate throughout the roast (within ~15-20%).
function happyBT(t) {
  // Phase 1: pre-charge rise (370→405°F) — ~150s (realistic)
  const RISE_END   = 150;
  const RISE_START = 370;
  const CHARGE_T   = 405;

  // Phase 2: charge drop (405→165°F) — ~90s (realistic)
  const DROP_END = 240;
  const TP_TEMP  = 165;

  if (t <= 0) return RISE_START;

  // Rising to charge temp
  if (t < RISE_END) {
    return RISE_START + (CHARGE_T - RISE_START) * (t / RISE_END);
  }

  // Charge drop — exponential (steep at first, eases into turning point)
  if (t < DROP_END) {
    const p = (t - RISE_END) / (DROP_END - RISE_END);
    return CHARGE_T + (TP_TEMP - CHARGE_T) * (1 - Math.pow(1 - p, 2));
  }

  // Phase 3: climb using integrated RoR model
  // RoR profile (°F/min): ramp 10→28 over first 3min, hold ~28 for 4min,
  // then decline 28→12 over final 4min. This matches real E46 data.
  return climbBT(t - DROP_END);
}

// Integrated RoR model for realistic climb from turning point.
// Builds the temperature by accumulating per-second deltas from a smooth
// RoR curve, so the RoR the bridge calculates will match what we intended.
const _climbCache = [165]; // pre-compute on first call
function climbBT(dt) {
  // Fill cache up to the requested time
  while (_climbCache.length <= dt) {
    const s = _climbCache.length; // seconds since turning point
    const ror = climbRoR(s);      // °F/min at this second
    const prev = _climbCache[s - 1];
    _climbCache.push(prev + ror / 60); // accumulate °F per second
  }
  return _climbCache[dt];
}

// RoR curve (°F/min) as a function of seconds since turning point.
// Calibrated against Prato profile targets (the most-used E46 profile):
//   165→270°F in ~224s (28°F/min), 270→320 in ~100s (30°F/min),
//   320→370 in ~130s (23°F/min), 370→408 in ~140s (16°F/min),
//   408→429 in ~100s (12°F/min)
function climbRoR(s) {
  if (s < 15)  return 18 + (30 - 18) * (s / 15);    // quick ramp to full RoR
  if (s < 100) return 30 + 2 * ((s - 15) / 85);     // 30→32 peak
  if (s < 220) return 32 - 4 * ((s - 100) / 120);   // 32→28
  if (s < 380) return 28 - 8 * ((s - 220) / 160);   // 28→20
  if (s < 520) return 20 - 6 * ((s - 380) / 140);   // 20→14
  return 14 - 2 * Math.min(1, (s - 520) / 200);     // 14→12
}

// ET (environmental/exhaust) — stays above BT throughout
function happyET(t) {
  if (t <= 0) return 460;
  if (t < 150) return 460 + 10 * (t / 150);          // slight rise pre-charge
  if (t < 240) return 470 - 50 * ((t - 150) / 90);   // dip after charge
  // During climb: ET tracks ~60-80°F above BT, narrowing as roast progresses
  const bt = happyBT(t);
  return bt + 80 - 20 * Math.min(1, (t - 240) / 660);
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
  const et = happyET(simT);
  return { bt: round1(bt), et: round1(et), t: simT };
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
