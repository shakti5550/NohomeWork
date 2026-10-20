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
    // Create a solid blue square first, then composite the SVG on top.
    // This guarantees every pixel is blue — no transparent corners for
    // iOS to render as a black border.
    const blueBg = sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 37, g: 99, b: 235, alpha: 255 },
      },
    }).png();

    const svgBuffer = await sharp(SVG_PATH)
      .resize(size, size, { fit: 'contain' })
      .toBuffer();

    await blueBg
      .composite([{ input: svgBuffer }])
      .png({ quality: 100 })
      .toFile(outPath);
    console.log(`Generated ${outPath} (${size}x${size})`);
  }
}

generate().catch((err) => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});