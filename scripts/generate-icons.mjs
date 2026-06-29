import sharp from 'sharp';
import { mkdir, copyFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'assets', 'icon-1024.png');
const out = path.join(
  root,
  'ios',
  'RunAnywhereStarter',
  'Images.xcassets',
  'AppIcon.appiconset',
);

const sizes = [
  { name: 'icon-40.png', px: 40 },
  { name: 'icon-58.png', px: 58 },
  { name: 'icon-60.png', px: 60 },
  { name: 'icon-80.png', px: 80 },
  { name: 'icon-87.png', px: 87 },
  { name: 'icon-120.png', px: 120 },
  { name: 'icon-180.png', px: 180 },
  { name: 'icon-1024.png', px: 1024 },
];

const assetsDir = path.join(root, 'assets');

await mkdir(out, { recursive: true });
for (const { name, px } of sizes) {
  await sharp(src).resize(px, px).png().toFile(path.join(out, name));
  console.log(`  ${name} (${px}x${px})`);
}

for (const px of [48, 96, 192]) {
  const name = `shield-${px}.png`;
  await sharp(src).resize(px, px).png().toFile(path.join(assetsDir, name));
  console.log(`  assets/${name} (${px}x${px})`);
}

console.log('Done — icons written to AppIcon.appiconset');
