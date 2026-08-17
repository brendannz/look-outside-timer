// Headless check of the scheduling logic. Run with:  npm test
// Uses Electron's main process (powerMonitor needs it) but opens no windows.

const { app, powerMonitor } = require('electron');
const path = require('path');

const { BreakTimer, REST, WORK } = require(path.join(__dirname, '..', 'src', 'main', 'timer.js'));
const callDetector = require(path.join(__dirname, '..', 'src', 'main', 'callDetector.js'));
const quotes = require(path.join(__dirname, '..', 'src', 'main', 'quotes.js'));

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
  checks += 1;
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (got ${actual}, expected ${expected})`}`);
}

function ok(label, condition, detail) {
  checks += 1;
  if (!condition) failures += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${condition ? '' : `  (${detail})`}`);
}

// --- test scaffolding -----------------------------------------------------

const CFG = {
  workMinutes: 2,          // 120s target
  restSeconds: 10,
  idleResetSeconds: 60,
  prewarnSeconds: 30,
  skipUnlockSeconds: 5,
  postponeMinutes: 5,
  postCallGraceSeconds: 30,
  pauseDuringCalls: true,
  watchWebcam: true,
  callApps: ['zoom.exe'],
  categories: { funny: true, interesting: true, parenting: true, product: true },
  recentQuotes: []
};

let fakeIdle = 0;
powerMonitor.getSystemIdleTime = () => fakeIdle;

function makeTimer() {
  const t = new BreakTimer(() => CFG);
  const events = [];
  for (const name of ['prewarn', 'prewarn-cancel', 'rest-start', 'rest-end']) {
    t.on(name, (arg) => events.push({ name, arg }));
  }
  t.events = events;
  return t;
}

const advance = (t, n) => { for (let i = 0; i < n; i++) t._tick(); };
const saw = (t, name) => t.events.some((e) => e.name === name);
const lastReason = (t) => [...t.events].reverse().find((e) => e.name === 'rest-end')?.arg;

// --- scheduling -----------------------------------------------------------

function testCountdownAndPrewarn() {
  console.log('\n# work period counts down and warns before firing');
  const t = makeTimer();
  fakeIdle = 0;

  advance(t, 89);
  check('no warning before the threshold', saw(t, 'prewarn'), false);
  check('still working', t.state, WORK);

  advance(t, 1); // 90s of 120s, prewarn window is 30s
  check('warning fires 30s out', saw(t, 'prewarn'), true);
  check('no break yet', t.state, WORK);

  advance(t, 30);
  check('break starts at the work target', t.state, REST);
  check('rest length applied', t.restRemaining, 10);
}

function testRestCompletes() {
  console.log('\n# rest runs down and hands back to work');
  const t = makeTimer();
  fakeIdle = 0;
  advance(t, 120);
  check('resting', t.state, REST);

  advance(t, 10);
  check('back to work', t.state, WORK);
  check('work period restarted', t.workElapsed, 0);
  check('rest-end emitted', saw(t, 'rest-end'), true);
  // main.js only plays the end-of-break chime when reason is 'completed' —
  // this is the value it switches on.
  check('reason is "completed" for a natural finish', lastReason(t), 'completed');
}

function testIdleResetsWorkPeriod() {
  console.log('\n# stepping away resets the work period');
  const t = makeTimer();
  fakeIdle = 0;
  advance(t, 100);
  check('accumulated work time', t.workElapsed, 100);

  fakeIdle = 60; // hit the idle threshold
  advance(t, 1);
  check('work period rewound', t.workElapsed, 0);
  check('pending warning withdrawn', saw(t, 'prewarn-cancel'), true);

  fakeIdle = 0;
  advance(t, 30);
  check('restarts from zero on return', t.workElapsed, 30);
  check('no break triggered on return', t.state, WORK);
}

function testIdleBelowThresholdDoesNotReset() {
  console.log('\n# a short pause is not a break');
  const t = makeTimer();
  fakeIdle = 0;
  advance(t, 50);
  fakeIdle = 59; // one second under the threshold
  advance(t, 1);
  check('work time preserved', t.workElapsed, 51);
}

function testCallHoldsTheTimer() {
  console.log('\n# calls hold the timer instead of interrupting');
  const t = makeTimer();
  fakeIdle = 0;
  advance(t, 100);

  t.setCallState(true, ['Zoom.exe']);
  advance(t, 300); // five minutes of call
  check('work time frozen during the call', t.workElapsed, 100);
  check('no break during the call', t.state, WORK);
}

function testBreakDeferredUntilCallEnds() {
  console.log('\n# a break owed during a call waits, then gets a grace period');
  const t = makeTimer();
  fakeIdle = 0;
  advance(t, 119);

  t.setCallState(true, ['Zoom.exe']);
  advance(t, 200);
  check('break withheld while on the call', t.state, WORK);

  t.setCallState(false, []);
  check('clamped back by the grace period', t.workElapsed, 90); // 120 - 30

  advance(t, 29);
  check('no ambush right after hanging up', t.state, WORK);
  advance(t, 1);
  check('break lands after the grace period', t.state, REST);
}

function testCallDuringRestEndsIt() {
  console.log('\n# a call starting mid-break dismisses the overlay');
  const t = makeTimer();
  fakeIdle = 0;
  advance(t, 120);
  check('resting', t.state, REST);

  t.setCallState(true, ['MSTeams']);
  check('overlay dismissed for the call', t.state, WORK);
  check('break still owed', t.workElapsed, 120);
  // Cut short by a call, not a natural finish — should not read as 'completed'
  // (main.js would otherwise play the end-of-break chime for an interrupted break).
  check('reason reflects the interruption, not completion', lastReason(t), 'call');

  t.setCallState(false, []);
  advance(t, 30);
  check('break returns after the call', t.state, REST);
}

function testSkipAndPostpone() {
  console.log('\n# skip and postpone');
  const t = makeTimer();
  fakeIdle = 0;
  advance(t, 120);
  t.skipBreak();
  check('skipping returns to work', t.state, WORK);
  check('skipping restarts the work period', t.workElapsed, 0);
  check('skip is not reported as a natural completion', lastReason(t), 'skipped');

  const t2 = makeTimer();
  advance(t2, 120);
  t2.postponeBreak();
  check('postponing leaves rest', t2.state, WORK);
  check('postpone is not reported as a natural completion', lastReason(t2), 'postponed');
  ok('postpone pushes the break out',
    t2.workElapsed <= Math.max(0, 120 - CFG.postponeMinutes * 60),
    `workElapsed=${t2.workElapsed}`);
}

function testManualPause() {
  console.log('\n# manual pause');
  const t = makeTimer();
  fakeIdle = 0;
  advance(t, 100);
  t.pauseFor(60);
  advance(t, 600);
  check('nothing accumulates while paused', t.workElapsed, 100);
  check('no break while paused', t.state, WORK);

  t.resume();
  advance(t, 20);
  check('resumes where it left off', t.workElapsed, 120 - 0);
  check('break fires after resuming', t.state, REST);
}

function testPostponeDuringPrewarnDismissesToast() {
  console.log('\n# postponing from the tray menu while the heads-up toast is up dismisses it');
  const t = makeTimer();
  fakeIdle = 0;

  advance(t, 91); // past the 30s-out prewarn threshold (target 120s)
  check('toast is showing', saw(t, 'prewarn'), true);
  check('still in the work state', t.state, WORK);

  // Simulate the tray menu's "Postpone" item, reachable at any time — not the
  // overlay's own button, which only exists once state is REST.
  t.events.length = 0;
  t.postponeBreak();
  check('postponing tells the toast to close', saw(t, 'prewarn-cancel'), true);

  advance(t, 1);
  check('no immediate re-trigger the instant after postponing', t.state, WORK);
}

// --- quotes ---------------------------------------------------------------

function testQuotes() {
  console.log('\n# quote library');
  ok(`library has ${quotes.total} quotes`, quotes.total >= 150, `only ${quotes.total}`);

  const counts = quotes.countByCategory();
  for (const cat of ['funny', 'interesting', 'parenting', 'product']) {
    ok(`${cat}: ${counts[cat]} quotes`, counts[cat] >= 30, `only ${counts[cat]}`);
  }

  const ids = new Set(quotes.QUOTES.map((q) => q.id));
  check('all quote ids unique', ids.size, quotes.total);

  const texts = new Set(quotes.QUOTES.map((q) => q.text));
  check('no duplicate quote text', texts.size, quotes.total);

  // Draw many quotes and confirm the no-repeat window actually holds.
  const cfg = { categories: { funny: true }, recentQuotes: [] };
  const persist = (patch) => Object.assign(cfg, patch);
  const drawn = [];
  const funnyCount = counts.funny;
  const window = Math.floor(funnyCount * 0.6);
  for (let i = 0; i < window; i++) drawn.push(quotes.pick(cfg, persist).id);
  check(`${window} consecutive draws with no repeat`, new Set(drawn).size, window);
}

// --- call detection (against the real machine) ----------------------------

async function testCallDetection() {
  console.log('\n# call detection reads the live Windows consent store');
  const all = await callDetector.detectAll();
  ok('registry query returns without throwing', Array.isArray(all), 'not an array');
  console.log(`      currently holding mic/camera: ${all.length ? all.join(', ') : '(nothing)'}`);

  const res = await callDetector.detect({ callApps: CFG.callApps, watchWebcam: true });
  ok('detect() returns a usable shape',
    typeof res.inCall === 'boolean' && Array.isArray(res.apps),
    JSON.stringify(res));

  // Nothing should match a deliberately impossible name.
  const none = await callDetector.detect({ callApps: ['zzz-not-a-real-app'], watchWebcam: true });
  check('unknown app name matches nothing', none.inCall, false);
}

app.whenReady().then(async () => {
  testCountdownAndPrewarn();
  testRestCompletes();
  testIdleResetsWorkPeriod();
  testIdleBelowThresholdDoesNotReset();
  testCallHoldsTheTimer();
  testBreakDeferredUntilCallEnds();
  testCallDuringRestEndsIt();
  testSkipAndPostpone();
  testManualPause();
  testPostponeDuringPrewarnDismissesToast();
  testQuotes();
  await testCallDetection();

  console.log(`\n${checks - failures}/${checks} checks passed`);
  app.exit(failures === 0 ? 0 : 1);
});
