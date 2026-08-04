// CLI for the Startup-folder shortcut. The app manages this itself via the
// "Start automatically when I sign in" setting; this is for doing it without
// opening the app.
//
//   npm run autostart:on
//   npm run autostart:off
//   npm run autostart:status

const path = require('path');
const fs = require('fs');
const autostart = require(path.join(__dirname, '..', 'src', 'main', 'autostart.js'));

const projectRoot = path.resolve(__dirname, '..');
const exePath = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
const iconPath = path.join(projectRoot, 'build', 'icon.ico');

async function main() {
  const mode = process.argv[2];

  if (mode === 'on') {
    if (!fs.existsSync(exePath)) {
      console.error(`Electron binary not found at ${exePath}\nRun: node node_modules/electron/install.js`);
      process.exit(1);
    }
    const created = await autostart.enable({ exePath, appPath: projectRoot, iconPath });
    console.log(`Autostart enabled.\n  ${created}\n  -> ${exePath} "${projectRoot}" --hidden`);
    return;
  }

  if (mode === 'off') {
    autostart.disable();
    console.log('Autostart disabled.');
    return;
  }

  if (mode === 'status') {
    console.log(`Autostart shortcut present: ${autostart.isEnabled() ? 'yes' : 'no'}`);
    console.log(`  ${autostart.shortcutPath()}`);
    return;
  }

  console.error('Usage: node scripts/autostart.js <on|off|status>');
  process.exit(1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
