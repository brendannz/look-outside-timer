const { app, Tray, Menu, ipcMain, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const config = require('./config');
const quotes = require('./quotes');
const callDetector = require('./callDetector');
const autostart = require('./autostart');
const { BreakTimer, REST } = require('./timer');
const windows = require('./windows');

const ICON_PATH = path.join(__dirname, '..', '..', 'build', 'icon.ico');
const CALL_POLL_MS = 5000;

let tray = null;
let timer = null;
let lastMenuKey = '';

// Only one copy may run, or you get duplicate overlays.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// Relaunching with --preview fires a break in the copy that is already running,
// which is how you test the overlay without waiting out a work period.
app.on('second-instance', (_event, argv) => {
  if (argv.includes('--preview')) {
    if (timer) timer.takeBreakNow();
  } else {
    windows.showSettings(ICON_PATH);
  }
});

// Tray app: closing the settings window must not quit.
app.on('window-all-closed', () => {});

// In a packaged build the icon lives inside app.asar, and electron-builder also
// unpacks it to app.asar.unpacked. Try both, and reject an image that failed to
// decode: a broken tray icon renders as nothing at all rather than as an error,
// so it is worth being explicit about.
function trayIcon() {
  const candidates = [
    ICON_PATH,
    ICON_PATH.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`)
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const image = nativeImage.createFromPath(candidate);
    if (!image.isEmpty()) return image;
  }

  console.warn(`Tray icon unavailable (tried: ${candidates.join(' , ')}) — run "npm run icon"`);
  return nativeImage.createEmpty();
}

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

function statusLine(snap) {
  if (snap.state === REST) return `Resting — ${formatDuration(snap.restRemaining)} left`;
  if (snap.paused) {
    const mins = Math.ceil((snap.pausedUntil - Date.now()) / 60000);
    return `Paused for ${mins} min`;
  }
  if (snap.inCall) return `On a call (${snap.callApps.join(', ')}) — held`;
  if (snap.idleSeconds >= config.load().idleResetSeconds) return 'Idle — work period reset';
  return `Next break in ${Math.ceil(snap.secondsUntilBreak / 60)} min`;
}

function applyLoginItem(enabled) {
  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      path: process.execPath,
      args: ['--hidden']
    });
    return;
  }

  // Running from source: setLoginItemSettings would register electron.exe with
  // no app argument, which starts nothing useful. Manage a Startup-folder
  // shortcut instead. Rewriting it on every launch also repairs it if the
  // project folder moved or node_modules was reinstalled.
  try {
    if (!enabled) {
      autostart.disable();
      return;
    }
    autostart
      .enable({
        exePath: process.execPath,
        appPath: app.getAppPath(),
        iconPath: ICON_PATH
      })
      .catch((err) => console.error('Could not register autostart:', err.message));
  } catch (err) {
    console.error('Could not update autostart:', err.message);
  }
}

// Opens the folder itself rather than selecting the file inside it.
// shell.showItemInFolder wraps SHOpenFolderAndSelectItems, which on Windows
// silently does the wrong thing when the target is missing and can reuse an
// unrelated Explorer window; openPath just opens the directory.
async function openConfigFolder() {
  const file = config.configPath();
  const dir = path.dirname(file);

  try {
    fs.mkdirSync(dir, { recursive: true });
    // On a first run nothing has been saved yet, so write the defaults out —
    // an empty folder is a confusing thing to be shown.
    if (!fs.existsSync(file)) config.save({});
  } catch (err) {
    console.error('Could not prepare config folder:', err.message);
  }

  const failure = await shell.openPath(dir);
  if (failure) console.error('Could not open config folder:', failure);
}

function rebuildMenu(snap) {
  const paused = snap.paused;
  const menu = Menu.buildFromTemplate([
    { label: statusLine(snap), enabled: false },
    { type: 'separator' },
    { label: 'Take a break now', click: () => timer.takeBreakNow() },
    {
      label: `Postpone ${config.load().postponeMinutes} min`,
      click: () => timer.postponeBreak()
    },
    { type: 'separator' },
    {
      label: paused ? 'Resume reminders' : 'Pause for 1 hour',
      click: () => (paused ? timer.resume() : timer.pauseFor(60))
    },
    { label: 'Pause for 30 min', visible: !paused, click: () => timer.pauseFor(30) },
    { type: 'separator' },
    { label: 'Settings…', click: () => windows.showSettings(ICON_PATH) },
    { label: 'Open config folder', click: () => openConfigFolder() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.exit(0) }
  ]);
  tray.setContextMenu(menu);
}

function updateTray(snap) {
  const line = statusLine(snap);
  tray.setToolTip(
    snap.state === REST
      ? `Look Outside — resting, ${formatDuration(snap.restRemaining)} left`
      : `Look Outside — ${line}`
  );

  // Rebuilding the menu every second is wasteful; the label only changes at
  // minute granularity anyway.
  const key = `${snap.state}|${snap.paused}|${snap.inCall}|${line}`;
  if (key !== lastMenuKey) {
    lastMenuKey = key;
    rebuildMenu(snap);
  }
}

function startCallPolling() {
  const poll = async () => {
    const cfg = config.load();
    if (!cfg.pauseDuringCalls) {
      timer.setCallState(false, []);
      return;
    }
    try {
      const { inCall, apps } = await callDetector.detect(cfg);
      timer.setCallState(inCall, apps);
    } catch (err) {
      console.error('Call detection failed:', err.message);
    }
  };
  poll();
  setInterval(poll, CALL_POLL_MS);
}

function wireTimer() {
  timer.on('tick', (snap) => {
    updateTray(snap);
    if (snap.state === REST) {
      windows.tickOverlays({
        remaining: snap.restRemaining,
        total: snap.restTotal
      });
    }
  });

  timer.on('prewarn', (secondsLeft) => {
    windows.showPrewarn({ seconds: secondsLeft });
  });

  timer.on('prewarn-cancel', () => windows.hidePrewarn());

  timer.on('rest-start', ({ seconds }) => {
    const cfg = config.load();
    windows.hidePrewarn();

    const quote = quotes.pick(cfg, (patch) => config.save(patch));
    windows.showOverlays({
      total: seconds,
      remaining: seconds,
      skipUnlockSeconds: cfg.skipUnlockSeconds,
      postponeMinutes: cfg.postponeMinutes,
      quote
    });

    if (cfg.playSound) shell.beep();
  });

  timer.on('rest-end', () => windows.destroyOverlays());
}

function registerIpc() {
  ipcMain.on('rest-skip', () => timer.skipBreak());
  ipcMain.on('rest-postpone', () => timer.postponeBreak());
  ipcMain.on('break:now', () => timer.takeBreakNow());

  ipcMain.on('window:close', (event) => {
    const win = require('electron').BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) win.close();
  });

  ipcMain.handle('app:version', () => app.getVersion());

  ipcMain.handle('config:get', () => config.load());

  ipcMain.handle('config:save', (_e, patch) => {
    const next = config.save(patch);
    applyLoginItem(next.startAtLogin);
    lastMenuKey = ''; // force the tray labels to pick up new durations
    return next;
  });

  ipcMain.handle('status:get', () => timer.snapshot());
  ipcMain.handle('calls:detect-all', () => callDetector.detectAll());
  ipcMain.handle('quotes:stats', () => ({
    total: quotes.total,
    byCategory: quotes.countByCategory()
  }));
}

app.whenReady().then(() => {
  const cfg = config.load();
  applyLoginItem(cfg.startAtLogin);

  timer = new BreakTimer(() => config.load());

  tray = new Tray(trayIcon());
  tray.setToolTip('Look Outside Timer');
  tray.on('click', () => windows.showSettings(ICON_PATH));
  rebuildMenu(timer.snapshot());

  registerIpc();
  wireTimer();
  timer.start();
  startCallPolling();

  // Always starts straight to the tray. Settings opens only on request —
  // clicking the tray icon, or its "Settings…" menu item — never on its own.

  // Small delay so the tray and timer are fully wired before firing a preview break.
  if (process.argv.includes('--preview')) {
    setTimeout(() => timer.takeBreakNow(), 900);
  }
});
