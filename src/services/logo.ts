/**
 * Logo matching, on the machine.
 *
 * The worker fetches the page's favicon (no cookies, no referrer), shrinks it
 * to 9x8 and compares its fingerprint against the bundled fingerprints of the
 * favicons brands actually serve. Nothing about the page leaves the machine:
 * the only request is for an icon the browser has already loaded once.
 *
 * Only run where it can change the answer: a page that is not a brand's or a
 * top site, and is asking for a secret or acting like a lure.
 */
import { dhashFromRgba, hamming, informative } from '../core/util/dhash.js';
import { BRAND_ICON_HASHES } from '../core/data/icons.js';

// Tuned on 356 favicons from 260 random top-20,000 sites: no false match at 5
// bits, two at 6. Four leaves a margin.
const MAX_DISTANCE = 4;
const cache = new Map<string, string[]>();

export function brandsForHash(hash: string): string[] {
  if (!informative(hash)) return [];
  const out: string[] = [];
  for (const [brand, hashes] of Object.entries(BRAND_ICON_HASHES)) {
    if (hashes.some((h) => hamming(h, hash) <= MAX_DISTANCE)) out.push(brand);
  }
  // An icon close to several brands is generic, not a brand's.
  return out.length > 2 ? [] : out;
}

export async function logoBrands(faviconUrl: string | undefined): Promise<string[]> {
  if (!faviconUrl) return [];
  const hit = cache.get(faviconUrl);
  if (hit) return hit;
  let result: string[] = [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(faviconUrl, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const blob = await res.blob();
      if (blob.size > 0 && blob.size < 2_000_000 && !/svg/i.test(blob.type)) {
        const bmp = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(9, 8);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(bmp, 0, 0, 9, 8);
          result = brandsForHash(dhashFromRgba(ctx.getImageData(0, 0, 9, 8).data));
        }
      }
    }
  } catch { /* unreachable, blocked or not an image: no claim */ }
  if (cache.size > 300) cache.clear();
  cache.set(faviconUrl, result);
  return result;
}
