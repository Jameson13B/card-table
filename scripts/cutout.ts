// Removes the white studio background from sealed-product photos so boxes can
// stand on the tablecloth. Flood-fills near-white pixels connected to the
// image edge (so white areas *inside* the box art are kept), feathers the
// edge slightly, trims the empty margin, and writes a WebP with alpha.

import sharp from 'sharp';

const WHITE = 248; // every channel at or above this counts as background

export async function cutout(src: string, dest: string, maxSize: number): Promise<void> {
  const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const isBg = (i: number) => data[i * 3] >= WHITE && data[i * 3 + 1] >= WHITE && data[i * 3 + 2] >= WHITE;

  const alpha = Buffer.alloc(w * h, 255);
  const stack: number[] = [];
  const push = (i: number) => {
    if (alpha[i] === 255 && isBg(i)) {
      alpha[i] = 0;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < w * (h - 1)) push(i + w);
  }

  // Soften the 1px fringe so edges don't look jagged.
  const mask = await sharp(alpha, { raw: { width: w, height: h, channels: 1 } }).blur(0.8).extractChannel(0).raw().toBuffer();

  await sharp(data, { raw: { width: w, height: h, channels: 3 } })
    .joinChannel(mask, { raw: { width: w, height: h, channels: 1 } })
    .png()
    .toBuffer()
    .then((buf) => sharp(buf).trim({ threshold: 1 }).resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 86, alphaQuality: 90 }).toFile(dest));
}
