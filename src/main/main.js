const { app, Tray, Menu, ipcMain, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const config = require('./config');
const quotes = require('./quotes');
const callDetector = require('./callDetector');
const autostart = require('./autostart');
const storeStartup = require('./storeStartup');
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
//
// Two autostart mechanisms (a login-item registry entry for packaged builds,
// a Startup-folder shortcut for running from source) can both be registered
// at once, so boot can launch this app twice. The loser of the single-instance
// race lands here with --hidden — that's an autostart launch, not a user
// double-clicking the icon, so it must stay silent rather than popping Settings.
app.on('second-instance', (_event, argv) => {
  if (argv.includes('--preview')) {
    if (timer) timer.takeBreakNow();
  } else if (!argv.includes('--hidden')) {
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
  // Microsoft Store (MSIX) build: sign-in launch is a manifest StartupTask.
  if (process.windowsStore) {
    storeStartup
      .set(!!enabled)
      .then((state) => {
        if (enabled && state !== 'Enabled') console.warn(`Startup task not enabled: ${state}`);
      })
      .catch((err) => console.error('Could not update startup task:', err.message));
    return;
  }

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

// A Store (MSIX) build's writes under %APPDATA% are redirected into the
// package's private LocalCache. Explorer runs outside the package and doesn't
// see that redirection, so point it at the real location. The package family
// name is Name_PublisherId, both taken from the install folder
// (WindowsApps\Name_Version_Arch_ResourceId_PublisherId). Falls back to the
// plain path when anything about that doesn't hold.
function explorerVisibleDir(dir) {
  if (!process.windowsStore) return dir;
  const roaming = process.env.APPDATA;
  const local = process.env.LOCALAPPDATA;
  const match = /[\\/]WindowsApps[\\/]([^\\/]+)/i.exec(process.execPath);
  if (!match || !roaming || !local) return dir;

  const parts = match[1].split('_');
  if (parts.length < 5) return dir;
  const family = `${parts[0]}_${parts[parts.length - 1]}`;
  const relative = path.relative(roaming, dir);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return dir;

  const redirected = path.join(local, 'Packages', family, 'LocalCache', 'Roaming', relative);
  return fs.existsSync(redirected) ? redirected : dir;
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

  const failure = await shell.openPath(explorerVisibleDir(dir));
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
    windows.showPrewarn({ seconds: secondsLeft, postponeMinutes: config.load().postponeMinutes });
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

  timer.on('rest-end', (reason) => {
    windows.destroyOverlays();
    // Only the break running its full course gets a chime — skipping,
    // postponing, or a call cutting it short are all choices you already
    // know about, so a sound there would just be noise.
    if (config.load().playSound && reason === 'completed') windows.playChime();
  });
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
  // No config file yet means the app has never run (or never saved) here.
  const firstRun = !fs.existsSync(config.configPath());
  const cfg = config.load();
  applyLoginItem(cfg.startAtLogin);

  timer = new BreakTimer(() => config.load());

  tray = new Tray(trayIcon());
  tray.setToolTip('Look Outside Reminder');
  tray.on('click', () => windows.showSettings(ICON_PATH));
  rebuildMenu(timer.snapshot());

  registerIpc();
  wireTimer();
  timer.start();
  startCallPolling();

  // Starts straight to the tray. Settings opens only on request — clicking
  // the tray icon, or its "Settings…" menu item — with one exception: the
  // very first launch, where a lone tray icon would look like nothing
  // happened. Writing the config file marks that first run as done. An
  // autostart launch (--hidden) never counts, so sign-in stays silent.
  if (firstRun && !process.argv.includes('--hidden')) {
    config.save({});
    windows.showSettings(ICON_PATH);
  }

  // Small delay so the tray and timer are fully wired before firing a preview break.
  if (process.argv.includes('--preview')) {
    setTimeout(() => timer.takeBreakNow(), 900);
  }
});
