import { open } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

export class ImageError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// Shared across requests, so parallel uploads cannot create unbounded decoders.
let active = 0;
const waiting = [];
async function limited(fn) {
  if (active >= 2) await new Promise(resolve => waiting.push(resolve));
  else active++;
  try { return await fn(); }
  finally { const next = waiting.shift(); if (next) next(); else active--; }
}

export async function processImage(path, directory) {
  return limited(async () => {
    const handle = await open(path, 'r');
    const header = Buffer.alloc(8);
    let bytesRead;
    try { ({ bytesRead } = await handle.read(header, 0, 8, 0)); } finally { await handle.close(); }
    const jpeg = bytesRead >= 3 && header.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    const png = bytesRead === 8 && header.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!jpeg && !png) throw new ImageError('INVALID_IMAGE', 'Ảnh phải là JPEG hoặc PNG hợp lệ.');
    try {
      const options = { limitInputPixels: 40_000_000, failOn: 'warning', animated: false };
      const meta = await sharp(path, options).metadata();
      if ((jpeg && meta.format !== 'jpeg') || (png && meta.format !== 'png') || !meta.width || !meta.height || meta.pages > 1) throw new Error('Invalid format');
      const swap = meta.orientation >= 5 && meta.orientation <= 8;
      const width = swap ? meta.height : meta.width;
      const height = swap ? meta.width : meta.height;
      const variants = [];
      for (const size of new Set([320, 960, 1600].map(n => Math.min(n, width)))) {
        const output = join(directory, `variant-${size}.webp`);
        // toFile performs an actual decode; default output drops all EXIF/GPS.
        const info = await sharp(path, options).rotate().resize({ width: size, withoutEnlargement: true }).webp().toFile(output);
        variants.push({ path: output, width: info.width, height: info.height, bytes: info.size, mime: 'image/webp' });
      }
      return { width, height, variants };
    } catch (error) {
      if (error instanceof ImageError) throw error;
      throw new ImageError('INVALID_IMAGE', 'Ảnh bị hỏng, không hợp lệ hoặc vượt giới hạn 40 triệu pixel.');
    }
  });
}
