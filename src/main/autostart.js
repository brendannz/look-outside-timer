// Startup-folder shortcut management.
//
// The packaged build registers itself for login through
// app.setLoginItemSettings, but that only works for a packaged app. When the
// app runs from source — the working path on machines where Smart App Control
// blocks unsigned executables — this shortcut is what starts it at sign-in.
//
// Deliberately free of any electron import so the CLI in scripts/ can share it.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const SHORTCUT_NAME = 'Look Outside Timer.lnk';

function startupDir() {
  return path.join(
    process.env.APPDATA,
    'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'
  );
}

function shortcutPath() {
  return path.join(startupDir(), SHORTCUT_NAME);
}

function isEnabled() {
  return fs.existsSync(shortcutPath());
}

function disable() {
  try {
    fs.unlinkSync(shortcutPath());
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

// PowerShell single-quoted literal: escape embedded quotes by doubling them.
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

/**
 * Writes the Startup shortcut. Rewriting an existing one is how a moved or
 * reinstalled project heals itself: the app calls this on every launch.
 *
 * @param {object} opts
 * @param {string} opts.exePath  executable to run (the signed Electron binary)
 * @param {string} opts.appPath  app directory, passed as its first argument
 * @param {string} opts.iconPath .ico used for the shortcut
 */
function enable({ exePath, appPath, iconPath }) {
  const script = `
    $s = (New-Object -ComObject WScript.Shell).CreateShortcut(${q(shortcutPath())})
    $s.TargetPath = ${q(exePath)}
    $s.Arguments = ${q(`"${appPath}" --hidden`)}
    $s.WorkingDirectory = ${q(appPath)}
    $s.IconLocation = ${q(`${iconPath},0`)}
    $s.Description = 'Eye-break reminder'
    $s.WindowStyle = 7
    $s.Save()
  `;

  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: 20000 },
      (err) => (err ? reject(err) : resolve(shortcutPath()))
    );
  });
}

module.exports = { enable, disable, isEnabled, shortcutPath, startupDir };
