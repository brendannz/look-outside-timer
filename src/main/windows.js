const { BrowserWindow, screen } = require('electron');
const path = require('path');

const PRELOAD = path.join(__dirname, '..', 'preload', 'bridge.js');
const RENDERER = path.join(__dirname, '..', 'renderer');

const webPreferences = {
  preload: PRELOAD,
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: false
};

let overlays = [];
let prewarnWin = null;
let settingsWin = null;

// --- break overlay --------------------------------------------------------

// One overlay per monitor. Only the primary one takes focus and shows the
// controls; the others just dim so you cannot simply glance sideways.
function showOverlays(payload) {
  destroyOverlays();

  const primaryId = screen.getPrimaryDisplay().id;

  overlays = screen.getAllDisplays().map((display) => {
    const isPrimary = display.id === primaryId;
    const win = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: isPrimary,
      show: false,
      backgroundColor: '#00000000',
      webPreferences
    });

    // 'screen-saver' is the highest level available, so the overlay also covers
    // full-screen apps and presentations.
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    win.loadFile(path.join(RENDERER, 'overlay.html'), {
      query: { primary: isPrimary ? '1' : '0' }
    });

    win.webContents.once('did-finish-load', () => {
      win.webContents.send('rest-data', payload);
      win.show();
      if (isPrimary) win.focus();
    });

    return win;
  });
}

function tickOverlays(data) {
  for (const win of overlays) {
    if (!win.isDestroyed()) win.webContents.send('rest-tick', data);
  }
}

function destroyOverlays() {
  for (const win of overlays) {
    if (!win.isDestroyed()) win.destroy();
  }
  overlays = [];
}

// --- pre-warning toast ----------------------------------------------------

// Carries a Postpone button, so it can no longer be click-through the way it
// used to be — but it still opens via showInactive() below, so it never
// steals focus just by appearing. Only a deliberate click on it grabs focus,
// same as any normal notification.
function showPrewarn(payload) {
  if (prewarnWin && !prewarnWin.isDestroyed()) {
    prewarnWin.webContents.send('prewarn-data', payload);
    return;
  }

  const area = screen.getPrimaryDisplay().workArea;
  const width = 360;
  const height = 96;

  prewarnWin = new BrowserWindow({
    x: area.x + area.width - width - 24,
    y: area.y + area.height - height - 24,
    width,
    height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences
  });

  prewarnWin.setAlwaysOnTop(true, 'screen-saver');
  prewarnWin.loadFile(path.join(RENDERER, 'prewarn.html'));

  prewarnWin.webContents.once('did-finish-load', () => {
    prewarnWin.webContents.send('prewarn-data', payload);
    prewarnWin.showInactive();
  });

  prewarnWin.on('closed', () => {
    prewarnWin = null;
  });
}

function hidePrewarn() {
  if (prewarnWin && !prewarnWin.isDestroyed()) prewarnWin.destroy();
  prewarnWin = null;
}

// --- end-of-break chime ----------------------------------------------------

// A throwaway, invisible window whose only job is to run chime.html's Web
// Audio tone and then close itself. Electron's default autoplay policy
// permits this without a user gesture, unlike a regular web page.
function playChime() {
  const win = new BrowserWindow({
    width: 1,
    height: 1,
    show: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences
  });

  win.loadFile(path.join(RENDERER, 'chime.html'));

  // Safety net in case the renderer's own window.close() doesn't fire.
  const killTimer = setTimeout(() => {
    if (!win.isDestroyed()) win.destroy();
  }, 3000);
  win.on('closed', () => clearTimeout(killTimer));
}

// --- settings -------------------------------------------------------------

function showSettings(iconPath) {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return settingsWin;
  }

  settingsWin = new BrowserWindow({
    width: 640,
    height: 820,
    title: 'Look Outside Timer',
    icon: iconPath,
    autoHideMenuBar: true,
    backgroundColor: '#12161d',
    show: false,
    webPreferences
  });

  settingsWin.loadFile(path.join(RENDERER, 'settings.html'));
  settingsWin.once('ready-to-show', () => settingsWin.show());
  settingsWin.on('closed', () => {
    settingsWin = null;
  });

  return settingsWin;
}

function isSettingsWindow(win) {
  return settingsWin && win === settingsWin;
}

module.exports = {
  showOverlays,
  tickOverlays,
  destroyOverlays,
  showPrewarn,
  hidePrewarn,
  playChime,
  showSettings,
  isSettingsWindow
};
