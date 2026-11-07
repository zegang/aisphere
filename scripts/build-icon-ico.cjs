/**
 * Builds a real multi-size Windows .ico from resources/icons/icon.png.
 *
 * The previous .ico was a single 256x256 PNG entry wrapped in the ICO header.
 * Windows builds taskbar buttons from small 16/32px variants, and with only a
 * 256px entry the shell renders the icon wrongly (only part of it visible).
 * This writes genuine BMP (DIB) entries for 16/24/32/48/64/128 plus the
 * 256px PNG entry.
 *
 * Usage: electron.exe scripts/build-icon-ico.js
 */
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PNG = path.join(ROOT, 'resources', 'icons', 'icon.png');
const OUT = path.join(ROOT, 'resources', 'icons', 'icon.ico');
const SIZES = [16, 24, 32, 48, 64, 128];

function buildDibEntry(width, height, bgra, topDown = true) {
  const pixelCount = width * height * 4;
  const maskStride = Math.ceil(width / 8) + ((4 - (Math.ceil(width / 8) % 4)) % 4);
  const maskSize = maskStride * height;

  const bih = Buffer.alloc(40);
  bih.writeUInt32LE(40, 0);            // biSize
  bih.writeInt32LE(width, 4);          // biWidth
  bih.writeInt32LE(height * 2, 8);     // biHeight (XOR + AND in ICO DIBs)
  bih.writeUInt16LE(1, 12);            // biPlanes
  bih.writeUInt16LE(32, 14);           // biBitCount (BI_RGB)
  bih.writeUInt32LE(pixelCount + maskSize, 20); // biSizeImage

  const pixels = Buffer.alloc(pixelCount);
  const rowCount = width * 4;
  // Raw bitmaps are top-down; ICO DIBs are bottom-up.
  for (let y = 0; y < height; y++) {
    const from = topDown ? y : height - 1 - y;
    bgra.copy(pixels, (height - 1 - y) * rowCount, from * rowCount, (from + 1) * rowCount);
  }

  const mask = Buffer.alloc(maskSize); // AND mask all zero: alpha channel rules
  return Buffer.concat([bih, pixels, mask]);
}

app.whenReady().then(() => {
  const source = nativeImage.createFromPath(PNG);
  if (source.isEmpty()) {
    console.error('Failed to load', PNG);
    process.exit(1);
  }
  console.log('source:', source.getSize());

  const entries = [];
  for (const size of SIZES) {
    const resized = source.resize({ width: size, height: size, quality: 'best' });
    const { width, height } = resized.getSize();
    entries.push({ size, data: buildDibEntry(width, height, resized.toBitmap()) });
  }
  entries.push({ size: 256, data: fs.readFileSync(PNG), png: true });
  entries.sort((a, b) => a.size - b.size);

  const dir = Buffer.alloc(6 + 16 * entries.length);
  dir.writeUInt16LE(0, 0);                       // reserved
  dir.writeUInt16LE(1, 2);                       // type: icon
  dir.writeUInt16LE(entries.length, 4);          // count
  let offset = dir.length;
  entries.forEach((entry, i) => {
    const base = 6 + 16 * i;
    dir[base] = entry.png ? 0 : entry.size;      // width (0 = 256)
    dir[base + 1] = entry.png ? 0 : entry.size;  // height
    dir[base + 2] = 0;                           // colors
    dir[base + 3] = 0;                           // reserved
    dir.writeUInt16LE(1, base + 4);              // planes
    dir.writeUInt16LE(32, base + 6);             // bit count
    dir.writeUInt32LE(entry.data.length, base + 8);
    dir.writeUInt32LE(offset, base + 12);
    offset += entry.data.length;
  });

  const ico = Buffer.concat([dir, ...entries.map(e => e.data)]);
  fs.writeFileSync(OUT, ico);
  console.log(`icon.ico written: ${ico.length} bytes, entries: ${entries.map(e => e.size).join(' ')}`);
  app.quit();
});
