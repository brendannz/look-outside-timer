// Generates the Microsoft Store listing logos in store/, drawn from the same
// icon as the app. These are uploaded by hand in Partner Center (Store
// listings › Store logos), so unlike build/ they are committed.
//
//   npm run store-logos

const fs = require('fs');
const path = require('path');
const { renderTile } = require('./gen-icon');

// The Settings window's background, so the listing matches the app.
const BG = [0x12, 0x16, 0x1d];

const LOGOS = [
  ['AppTileIcon-300x300.png', 300, 300, 300, null],
  ['BoxArt-2160x2160.png', 2160, 2160, 1300, BG],
  ['PosterArt-1440x2160.png', 1440, 2160, 1000, BG]
];

const outDir = path.join(__dirname, '..', 'store');
fs.mkdirSync(outDir, { recursive: true });
for (const [name, width, height, iconSize, bg] of LOGOS) {
  fs.writeFileSync(path.join(outDir, name), renderTile(width, height, iconSize, bg));
  console.log(`Wrote ${path.join(outDir, name)}`);
}
