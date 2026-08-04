# Look Outside Timer

An eye-break reminder for Windows 11 that knows when you have already stepped
away, and gets out of the way when you are on a call.

- **20 minutes** of actual work, then a **1 minute** break (both configurable)
- **Idle-aware** — 1 minute away from the keyboard rewinds the work period, so
  coming back from a coffee does not immediately demand a break
- **Call-aware** — holds the timer while Teams, Zoom, or a browser (Google Meet)
  is using your microphone or camera
- 30-second heads-up warning, then a dimming overlay across every monitor
- Skip and Postpone unlock after 5 seconds, so you cannot reflex-dismiss it
- 160 quotes across funny, interesting, parenting and product management

## Running it

```bash
npm install
```

Electron's binary download is blocked by npm's install-script policy, so fetch it
once:

```bash
node node_modules/electron/install.js
```

Generate the icon and start:

```bash
npm run icon && npm start
```

The settings window opens on a manual launch, and the app lives in the system
tray. Right-click the tray icon for status, "Take a break now", postpone, pause,
and settings.

## Starting at sign-in

Settings → "Start automatically when I sign in" controls this, and is on by
default. Running from source it manages a shortcut in your Startup folder that
launches the app hidden, straight to the tray; the installed build uses
`app.setLoginItemSettings` instead. The app rewrites the shortcut on every
launch, so moving the project or reinstalling `node_modules` repairs itself the
next time it runs.

The same thing from the command line, without opening the app:

```bash
npm run autostart:status
npm run autostart:on
npm run autostart:off
```

> Running from source, the shortcut points at
> `node_modules/electron/dist/electron.exe`. Deleting `node_modules` without
> reinstalling, or moving the project folder while the app is not running, will
> break autostart until you launch the app once more or re-run
> `npm run autostart:on`.

## How idle detection works

`powerMonitor.getSystemIdleTime()` is Windows' own last-input timer, so it counts
time away from the machine regardless of which app has focus, including while
locked. When it passes the idle threshold the work period resets to zero. Coming
back from lock or sleep also resets it.

## How call detection works

Windows records every microphone and camera grant under:

```
HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore
```

Each app subkey has `LastUsedTimeStart` and `LastUsedTimeStop`. While an app is
actively streaming, `LastUsedTimeStop` is `0`. This is the same data behind the
"an app is using your camera" indicator, which means one check covers Teams,
Zoom, and Google Meet in **any** browser without matching on window titles.

The watch list defaults to Teams, Zoom, Chrome, Edge, Brave and Firefox, and is
editable in Settings. Apps such as Notion, Slack and Windows voice dictation also
use the mic but are deliberately not on the list, so they do not cause false
pauses. Settings has a "What is using my mic or camera right now?" button to help
you add anything missing.

If a break falls due mid-call it is held, then fires 30 seconds after you hang up
rather than the instant the call ends.

## Tests

```bash
npm test
```

45 checks covering the scheduler (countdown, pre-warning, idle reset, call hold,
post-call grace, a call starting mid-break, skip, postpone, manual pause), the
quote library's no-repeat guarantee, and live call detection against the real
registry.

## Building an installer

```bash
npm run dist
```

Produces `dist/LookOutsideTimer-Setup-<version>.exe` — a one-click NSIS installer
that installs per-user, creates shortcuts, and registers itself to start at
sign-in. Roughly 95 MB.

> **Smart App Control:** this machine has Smart App Control **enforced**, which
> blocks unsigned executables — so the packaged build and its installer will not
> launch here. Running from source (above) is unaffected, because Electron's own
> binary is signed. The installer is still useful for laptops that do not have
> Smart App Control on. Making the packaged build run on a Smart App Control
> machine requires either code-signing with a reputable certificate or turning
> the feature off, which cannot be re-enabled without resetting Windows.

## Configuration

Settings are stored at `%APPDATA%\Look Outside Timer\config.json` (tray menu →
"Open config folder").

| Setting | Default | Meaning |
| --- | --- | --- |
| `workMinutes` | 20 | Focused work before a break is due |
| `restSeconds` | 60 | How long the overlay stays up |
| `idleResetSeconds` | 60 | Time away that counts as a break |
| `prewarnSeconds` | 30 | Heads-up notice; `0` disables it |
| `skipUnlockSeconds` | 5 | Delay before Skip/Postpone become clickable |
| `postponeMinutes` | 5 | Length of a postpone |
| `postCallGraceSeconds` | 30 | Breathing room after a call ends |
| `pauseDuringCalls` | true | Hold the timer during calls |
| `watchWebcam` | true | Treat camera use as a call too |
| `callApps` | Teams, Zoom, browsers | Watch list |
| `startAtLogin` | true | Startup shortcut (source) or login item (installed) |

## Layout

```
src/main/main.js          tray, IPC, wiring
src/main/timer.js         the scheduling state machine
src/main/callDetector.js  ConsentStore registry reader
src/main/config.js        settings persistence
src/main/quotes.js        160 quotes + no-repeat selection
src/main/windows.js       overlay / pre-warning / settings windows
src/renderer/*.html       overlay, pre-warning toast, settings UI
scripts/gen-icon.js       dependency-free .ico generator
scripts/autostart.js      Startup-folder shortcut
scripts/selftest.js       test suite
```
