// Sign-in launch for the Microsoft Store (MSIX) build.
//
// A packaged Store app can't use app.setLoginItemSettings, and a Startup-folder
// shortcut would point into the versioned WindowsApps folder, which moves on
// every update. Instead the package manifest declares a StartupTask (see
// build/appx-extensions.xml) and this module flips it on and off through the
// WinRT StartupTask API.
//
// Electron has no WinRT bridge, so the call goes through Windows PowerShell,
// which can load WinRT types. A child process of a packaged app runs with the
// app's package identity, which is what StartupTask.GetAsync needs to find
// the task.
//
// A StartupTask can't pass arguments, so a sign-in launch arrives without
// --hidden. That's fine: a fresh launch already starts straight to the tray.

const { execFile } = require('child_process');

// Must match TaskId in build/appx-extensions.xml.
const TASK_ID = 'LookOutsideStartup';

// PowerShell 5.1 can't await WinRT async operations directly; AsTask bridges
// them to a .NET Task it can wait on.
function script(enabled) {
  return `
    $ErrorActionPreference = 'Stop'
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
      $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
      $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
    } | Select-Object -First 1
    function Await($op, [Type]$type) {
      $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
      $t.Wait(-1) | Out-Null
      $t.Result
    }
    [Windows.ApplicationModel.StartupTask, Windows.ApplicationModel, ContentType = WindowsRuntime] | Out-Null
    $task = Await ([Windows.ApplicationModel.StartupTask]::GetAsync('${TASK_ID}')) ([Windows.ApplicationModel.StartupTask])
    ${enabled
      ? `$state = Await ($task.RequestEnableAsync()) ([Windows.ApplicationModel.StartupTaskState])`
      : `$task.Disable(); $state = $task.State`}
    Write-Output $state
  `;
}

/**
 * Enables or disables the StartupTask. Resolves with the resulting state:
 * Enabled, Disabled, DisabledByUser (switched off in Task Manager or Settings,
 * which only the user can undo), or DisabledByPolicy.
 */
function set(enabled) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script(enabled)],
      { windowsHide: true, timeout: 20000 },
      (err, stdout, stderr) => (err ? reject(new Error(stderr.trim() || err.message)) : resolve(stdout.trim()))
    );
  });
}

module.exports = { set, TASK_ID };
