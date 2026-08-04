const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  workMinutes: 20,
  restSeconds: 60,
  idleResetSeconds: 60,

  prewarnSeconds: 30,
  skipUnlockSeconds: 5,
  postponeMinutes: 5,

  // After a call ends, wait this long before firing a break that fell due
  // mid-call, so you are not ambushed the instant you say goodbye.
  postCallGraceSeconds: 30,

  pauseDuringCalls: true,
  watchWebcam: true,
  // Matched case-insensitively against the ConsentStore key name.
  callApps: [
    'msteams',
    'teams.exe',
    'zoom.exe',
    'chrome.exe',
    'msedge.exe',
    'brave.exe',
    'firefox.exe'
  ],

  startAtLogin: true,
  playSound: true,

  categories: {
    funny: true,
    interesting: true,
    parenting: true,
    product: true
  },

  // Rolling window of recently shown quote ids, to avoid repeats.
  recentQuotes: []
};

let cache = null;

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

// Merges saved values over defaults one level deep, so a config written by an
// older version still picks up newly added keys.
function merge(base, saved) {
  const out = { ...base };
  for (const key of Object.keys(base)) {
    const val = saved[key];
    if (val === undefined) continue;
    if (Array.isArray(base[key])) {
      if (Array.isArray(val)) out[key] = val;
    } else if (base[key] && typeof base[key] === 'object') {
      out[key] = { ...base[key], ...(typeof val === 'object' ? val : {}) };
    } else if (typeof val === typeof base[key]) {
      out[key] = val;
    }
  }
  return out;
}

function load() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    cache = merge(DEFAULTS, JSON.parse(raw));
  } catch {
    cache = { ...DEFAULTS, categories: { ...DEFAULTS.categories }, recentQuotes: [] };
  }
  return cache;
}

function save(patch) {
  const next = merge(load(), patch || {});
  cache = next;
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(next, null, 2), 'utf8');
  } catch (err) {
    console.error('Could not save config:', err.message);
  }
  return next;
}

module.exports = { load, save, configPath, DEFAULTS };
