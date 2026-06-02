// End-to-end prototype test harness for the Artisan bridge.
//
// Spawns the real Python bridge (in a venv), drives it with mock_artisan.js,
// and validates the relayed stream with mock_iphone.js. Each scenario maps to
// a finding from the code review.
//
//   node run-tests.js

const { spawn } = require("child_process");
const net = require("net");
const path = require("path");

const PY = process.env.BRIDGE_PYTHON || "/Users/peter/PycharmProjects/coffee-roast-assistant/bridge/.venv/bin/python3";
const HERE = __dirname;
const FIXED = path.join(HERE, "..", "bridge.py");
const ORIGINAL = path.join(HERE, "bridge_original.py");
const HOST = "127.0.0.1";
const PORT = 8765;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function tryConnect(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, HOST);
    s.on("connect", () => { s.destroy(); resolve(true); });
    s.on("error", () => resolve(false));
  });
}
async function waitForPort(port, open, timeoutMs = 6000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if ((await tryConnect(port)) === open) return true;
    await sleep(100);
  }
  return false;
}

class Bridge {
  constructor(file, env = {}) {
    this.file = file;
    this.env = env;
    this.out = "";
  }
  async start() {
    this.proc = spawn(PY, [this.file], {
      cwd: HERE,
      env: { ...process.env, BRIDGE_HOST: HOST, BRIDGE_PORT: String(PORT), ...this.env },
    });
    const cap = (d) => { this.out += d.toString(); };
    this.proc.stdout.on("data", cap);
    this.proc.stderr.on("data", cap);
    const ok = await waitForPort(PORT, true);
    if (!ok) throw new Error("bridge did not open port\n" + this.out);
  }
  get alive() { return this.proc && this.proc.exitCode === null && !this.proc.killed; }
  async stop() {
    if (this.proc && this.proc.exitCode === null) {
      this.proc.kill("SIGTERM");
      await new Promise((r) => this.proc.on("exit", r));
    }
    await waitForPort(PORT, false);
  }
}

function spawnNode(script, env = {}) {
  return spawn("node", [path.join(HERE, script)], {
    cwd: HERE,
    env: { ...process.env, ...env },
  });
}
function awaitIphone(child) {
  return new Promise((resolve) => {
    let out = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.on("exit", () => {
      const line = out.split("\n").reverse().find((l) => l.startsWith("SUMMARY "));
      resolve(line ? JSON.parse(line.slice(8)) : null);
    });
  });
}

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  console.log(`      ${detail}`);
}

async function t1_happy() {
  const b = new Bridge(FIXED);
  await b.start();
  try {
    const artisan = spawnNode("mock_artisan.js", {
      SCENARIO: "happy", FRAME_INTERVAL_MS: "50", TIME_SCALE: "4", SIM_SECONDS: "400",
    });
    const s = await awaitIphone(spawnNode("mock_iphone.js", { RUN_MS: "6000" }));
    artisan.kill("SIGKILL");
    const pass = s && s.received >= 80 && s.malformed === 0 &&
      s.missingFields === 0 && s.withBt > 0 && s.withRor > 0 && !s.errored;
    record("T1 happy-path end-to-end flow", pass,
      `received=${s?.received} withBt=${s?.withBt} withRor=${s?.withRor} ` +
      `malformed=${s?.malformed} lastFrame=${JSON.stringify(s?.lastFrame)}`);
  } finally { await b.stop(); }
}

async function t2_routing() {
  const env = { SCENARIO: "happy", FRAME_INTERVAL_MS: "50", TIME_SCALE: "4", SIM_SECONDS: "200" };
  // Original bridge — expect the routing bug: app receives nothing.
  let origRecv, fixedRecv;
  {
    const b = new Bridge(ORIGINAL);
    await b.start();
    try {
      const a = spawnNode("mock_artisan.js", env);
      const s = await awaitIphone(spawnNode("mock_iphone.js", { RUN_MS: "3000" }));
      a.kill("SIGKILL");
      origRecv = s ? s.received : null;
    } finally { await b.stop(); }
  }
  // Fixed bridge — data flows.
  {
    const b = new Bridge(FIXED);
    await b.start();
    try {
      const a = spawnNode("mock_artisan.js", env);
      const s = await awaitIphone(spawnNode("mock_iphone.js", { RUN_MS: "3000" }));
      a.kill("SIGKILL");
      fixedRecv = s ? s.received : null;
    } finally { await b.stop(); }
  }
  const pass = origRecv === 0 && fixedRecv > 0;
  record("T2 path-routing bug reproduced + fixed", pass,
    `original bridge: app received ${origRecv} frames (bug) | ` +
    `fixed bridge: app received ${fixedRecv} frames`);
}

async function t3_junk() {
  const b = new Bridge(FIXED);
  await b.start();
  try {
    const a = spawnNode("mock_artisan.js", {
      SCENARIO: "junk", JUNK_FRAMES: "5",
      FRAME_INTERVAL_MS: "50", TIME_SCALE: "4", SIM_SECONDS: "400",
    });
    const s = await awaitIphone(spawnNode("mock_iphone.js", { RUN_MS: "6000" }));
    a.kill("SIGKILL");
    const survived = b.alive;
    const pass = s && s.received >= 80 && s.malformed === 0 &&
      s.nullBt >= 1 && s.withBt > 0 && survived;
    record("T3 junk readings don't kill the feed", pass,
      `received=${s?.received} nullBt(junk)=${s?.nullBt} withBt(recovered)=${s?.withBt} ` +
      `malformed=${s?.malformed} bridgeAlive=${survived}`);
  } finally { await b.stop(); }
}

async function t4_ror() {
  const b = new Bridge(FIXED, { BRIDGE_ROR_WINDOW: "5" });
  await b.start();
  try {
    const slope = 0.5; // °F per sim-second
    const expected = slope * 60; // 30 °F/min
    const a = spawnNode("mock_artisan.js", {
      SCENARIO: "linear", LINEAR_START: "200", LINEAR_SLOPE: String(slope),
      FRAME_INTERVAL_MS: "1000", TIME_SCALE: "1", SIM_SECONDS: "10",
    });
    const s = await awaitIphone(spawnNode("mock_iphone.js", { RUN_MS: "12000" }));
    a.kill("SIGKILL");
    const err = s && s.lastRor !== null ? Math.abs(s.lastRor - expected) : Infinity;
    const pass = err <= 5;
    record("T4 RoR magnitude correct (real-time)", pass,
      `expected≈${expected}°F/min, got ${s?.lastRor}°F/min (err=${err.toFixed(1)})`);
  } finally { await b.stop(); }
}

async function t5_multiclient() {
  const b = new Bridge(FIXED);
  await b.start();
  try {
    const a = spawnNode("mock_artisan.js", {
      SCENARIO: "happy", FRAME_INTERVAL_MS: "50", TIME_SCALE: "4", SIM_SECONDS: "600",
    });
    const pA = awaitIphone(spawnNode("mock_iphone.js", { LABEL: "A", RUN_MS: "8000" }));
    const pB = awaitIphone(spawnNode("mock_iphone.js",
      { LABEL: "B", RUN_MS: "8000", DISCONNECT_AFTER_MS: "2000" }));
    const [A, B] = await Promise.all([pA, pB]);
    a.kill("SIGKILL");
    const sawTwo = /2 client\(s\)/.test(b.out);
    const sawOne = /1 client\(s\)/.test(b.out);
    const pass = A && B && A.received > B.received && B.received > 0 &&
      sawTwo && sawOne && b.alive;
    record("T5 multi-client fan-out + mid-stream disconnect", pass,
      `A.received=${A?.received} (full run) B.received=${B?.received} (left @2s) ` +
      `bridgeSawCounts[2→1]=${sawTwo && sawOne} bridgeAlive=${b.alive}`);
  } finally { await b.stop(); }
}

(async () => {
  console.log("=== Artisan Bridge — end-to-end prototype tests ===\n");
  const ok = await waitForPort(PORT, false, 1000);
  if (!ok) { console.error(`port ${PORT} busy before start`); process.exit(1); }
  for (const t of [t1_happy, t2_routing, t3_junk, t4_ror, t5_multiclient]) {
    try { await t(); } catch (e) { record(t.name, false, "threw: " + e.message); }
    await sleep(300);
  }
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n=== ${passed}/${results.length} passed ===`);
  process.exit(passed === results.length ? 0 : 1);
})();
