// Detects an in-progress call by asking Windows which apps currently hold the
// microphone or webcam.
//
// Windows records every capability grant under CapabilityAccessManager's
// ConsentStore. Each app subkey carries LastUsedTimeStart and LastUsedTimeStop;
// while an app is actively streaming, LastUsedTimeStop is 0. This is the same
// data behind the "app is using your camera" indicator, so it covers Teams,
// Zoom, and Google Meet in any browser without matching on window titles.

const { execFile } = require('child_process');

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

/**
 * @returns {Promise<{ inCall: boolean, apps: string[] }>}
 */
async function detect({ callApps, watchWebcam }) {
  const capabilities = watchWebcam ? ['microphone', 'webcam'] : ['microphone'];
  const results = await Promise.all(capabilities.map(queryCapability));

  const apps = new Set();
  for (const entries of results) {
    for (const entry of entries) {
      if (isActive(entry) && matches(entry.key, callApps)) {
        apps.add(displayName(entry.key));
      }
    }
  }

  return { inCall: apps.size > 0, apps: [...apps] };
}

// Everything currently holding the mic or camera, matched or not. Used by the
// settings screen so you can see what to add to the watch list.
async function detectAll() {
  const results = await Promise.all(
    ['microphone', 'webcam'].map(queryCapability)
  );
  const apps = new Set();
  for (const entries of results) {
    for (const entry of entries) {
      if (isActive(entry)) apps.add(displayName(entry.key));
    }
  }
  return [...apps];
}

module.exports = { detect, detectAll };
