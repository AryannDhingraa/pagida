/**
 * Difference hash ("dHash") of a small image, for matching brand logos and
 * favicons without a network call.
 *
 * The image is drawn onto white at 9x8 pixels in greyscale; each of the 64
 * bits says whether a pixel is brighter than its right-hand neighbour. Copies
 * of the same icon at different sizes land within a few bits of each other,
 * while different icons differ in dozens. Kits copy brand favicons byte for
 * byte, so in practice a match is exact or very close.
 */

/** 64-bit hash as 16 hex characters, from RGBA pixels of a 9x8 image. */
export function dhashFromRgba(rgba: ArrayLike<number>): string {
  const grey: number[] = [];
  for (let i = 0; i < 72; i++) {
    const a = rgba[i * 4 + 3]! / 255;
    // Composite on white so transparent icons hash the same everywhere.
    const r = rgba[i * 4]! * a + 255 * (1 - a);
    const g = rgba[i * 4 + 1]! * a + 255 * (1 - a);
    const b = rgba[i * 4 + 2]! * a + 255 * (1 - a);
    grey.push(0.299 * r + 0.587 * g + 0.114 * b);
  }
  let hex = '';
  for (let row = 0; row < 8; row++) {
    let byte = 0;
    for (let col = 0; col < 8; col++) {
      const left = grey[row * 9 + col]!;
      const right = grey[row * 9 + col + 1]!;
      byte = (byte << 1) | (left > right ? 1 : 0);
    }
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

export function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < 16; i += 2) {
    let x = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

/** Plain or near-blank icons carry no identity and would match each other. */
export function informative(hash: string): boolean {
  let bits = 0;
  for (let i = 0; i < 16; i += 2) {
    let x = parseInt(hash.slice(i, i + 2), 16);
    while (x) { bits += x & 1; x >>= 1; }
  }
  return bits >= 10 && bits <= 54;
}
