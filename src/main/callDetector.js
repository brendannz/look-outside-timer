// Detects an in-progress call by asking Windows which apps currently hold the
// microphone or webcam. Two sources, unioned:
//
// 1. deviceWatch.ps1, a long-running PowerShell helper that asks the device
//    stacks directly (Media Foundation for cameras, WASAPI for microphones).
//    This is the reliable source on current Windows 11.
//
// 2. CapabilityAccessManager's ConsentStore in the registry. Each app subkey
//    carries LastUsedTimeStart and LastUsedTimeStop; while an app is actively
//    streaming, LastUsedTimeStop is 0. Windows 11 26H2 stopped updating these
//    live, so this is now only a fallback for older builds and for when the
//    helper cannot start.
//
// Neither matches on window titles, so Teams, Zoom, and Google Meet in any
// browser are all covered.

const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE =
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore';

function queryCapability(capability) {
  return new Promise((resolve) => {
    execFile(
      'reg',
      ['query', `${BASE}\\${capability}`, '/s'],
      { windowsHide: true, timeout: 5000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        // reg.exe returns non-zero when a subkey is unreadable but still
        // prints everything it could read, so parse stdout regardless.
        resolve(parse(stdout || ''));
      }
    );
  });
}

// Turns `reg query /s` output into [{ key, start, stop }].
function parse(stdout) {
  const entries = [];
  let current = null;

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/^HKEY_/i.test(trimmed)) {
      if (current && current.start !== null) entries.push(current);
      const leaf = trimmed.split('\\').pop();
      current = { key: leaf, start: null, stop: null };
      continue;
    }

    if (!current) continue;

    const m = trimmed.match(/^(LastUsedTimeStart|LastUsedTimeStop)\s+REG_QWORD\s+(0x[0-9a-f]+)$/i);
    if (m) {
      const value = BigInt(m[2]);
      if (/Start$/i.test(m[1])) current.start = value;
      else current.stop = value;
    }
  }
  if (current && current.start !== null) entries.push(current);

  return entries;
}

// NonPackaged keys store the full path with '#' where a backslash would be,
// e.g. C:#Program Files#Zoom#bin#Zoom.exe -> Zoom.exe
function displayName(key) {
  return key.includes('#') ? key.split('#').pop() : key;
}

function isActive(entry) {
  return entry.start !== null && entry.start > 0n && entry.stop === 0n;
}

function matches(key, patterns) {
  const haystack = key.toLowerCase();
  const leaf = displayName(key).toLowerCase();
  return patterns.some((p) => {
    const needle = String(p).toLowerCase().trim();
    return needle.length > 0 && (leaf.includes(needle) || haystack.includes(needle));
  });
}

// --- live helper -----------------------------------------------------------

// The helper prints a snapshot every 2s; anything older than this is stale.
const LIVE_MAX_AGE_MS = 10000;
const RESTART_DELAY_MS = 30000;

let helper = null;
let latest = null; // { at, camera: string[][], mic: string[][] }
let restartTimer = null;
let stopped = false;

// The script ships inside app.asar, which powershell.exe cannot read. Rather
// than copy it to disk, pipe it in on stdin and run it as a script block:
// execution policy (including one set by Group Policy) governs script files,
// not script blocks, so this also runs on machines that require signed .ps1.
const BOOTSTRAP = '& ([scriptblock]::Create([Console]::In.ReadToEnd()))';

function startHelper() {
  if (helper || stopped || process.platform !== 'win32') return;
  try {
    helper = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', BOOTSTRAP],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    helper.stdin.end(fs.readFileSync(path.join(__dirname, 'deviceWatch.ps1'), 'utf8'));
  } catch (err) {
    console.error('Device watcher failed to start:', err.message);
    helper = null;
    scheduleRestart();
    return;
  }

  let buffer = '';
  helper.stdout.setEncoding('utf8');
  helper.stdout.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const snap = JSON.parse(line);
        latest = {
          at: Date.now(),
          camera: snap.cameraOk ? snap.camera : null,
          mic: snap.micOk ? snap.mic : null
        };
      } catch {
        // A partial or garbled line; the next one is two seconds away.
      }
    }
  });
  helper.stderr.setEncoding('utf8');
  helper.stderr.on('data', (msg) => console.error('Device watcher:', msg.trim()));
  helper.on('error', (err) => console.error('Device watcher error:', err.message));
  helper.on('exit', () => {
    helper = null;
    latest = null;
    scheduleRestart();
  });
}

function scheduleRestart() {
  if (stopped || restartTimer) return;
  restartTimer = setTimeout(() => {
    restartTimer = null;
    startHelper();
  }, RESTART_DELAY_MS);
}

function stop() {
  stopped = true;
  clearTimeout(restartTimer);
  if (helper) helper.kill();
}

// Each live entry is a list of names for one process (exe, package family,
// WebView2 host), innermost first. Joined with '#' so displayName() shows the
// outermost name and matches() searches all of them.
function liveKeys(capability) {
  startHelper();
  if (!latest || Date.now() - latest.at > LIVE_MAX_AGE_MS) return [];
  const list = capability === 'webcam' ? latest.camera : latest.mic;
  return (list || []).map((names) => names.join('#'));
}

// Registry entries and live entries, as ConsentStore-style key names.
async function activeKeys(capability) {
  const entries = await queryCapability(capability);
  return [...entries.filter(isActive).map((e) => e.key), ...liveKeys(capability)];
}

// --- public API --------------------------------------------------------------

/**
 * @returns {Promise<{ inCall: boolean, apps: string[] }>}
 */
async function detect({ callApps, watchWebcam }) {
  const capabilities = watchWebcam ? ['microphone', 'webcam'] : ['microphone'];
  const results = await Promise.all(capabilities.map(activeKeys));

  const apps = new Set();
  for (const keys of results) {
    for (const key of keys) {
      if (matches(key, callApps)) apps.add(displayName(key));
    }
  }

  return { inCall: apps.size > 0, apps: [...apps] };
}

// Everything currently holding the mic or camera, matched or not. Used by the
// settings screen so you can see what to add to the watch list.
async function detectAll() {
  const results = await Promise.all(['microphone', 'webcam'].map(activeKeys));
  const apps = new Set();
  for (const keys of results) {
    for (const key of keys) apps.add(displayName(key));
  }
  return [...apps];
}

// Starts the live helper ahead of the first poll and resolves once it has
// reported, or after timeoutMs. Callers can skip this; detect() starts it too.
function warmUp(timeoutMs = 15000) {
  startHelper();
  const started = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      if (latest || Date.now() - started > timeoutMs) resolve(Boolean(latest));
      else setTimeout(check, 200);
    };
    check();
  });
}

module.exports = { detect, detectAll, warmUp, stop };
