import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SVG_PATH = path.join(PUBLIC_DIR, 'favicon.svg');

const SIZES = [
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' },
];

async function generate() {
  if (!fs.existsSync(SVG_PATH)) {
    throw new Error(`SVG not found at ${SVG_PATH}`);
  }

  for (const { size, name } of SIZES) {
    const outPath = path.join(PUBLIC_DIR, name);
    // Rasterize the full-bleed SVG directly to exact dimensions.
    // The SVG has a full-width background, guaranteeing every pixel is filled.
    await sharp(SVG_PATH)
      .resize(size, size)
      .png({ quality: 100 })
      .toFile(outPath);
    console.log(`Generated ${outPath} (${size}x${size})`);
  }
}

generate().catch((err) => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});