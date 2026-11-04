/**
 * QR codes inside emails, decoded on the machine.
 *
 * "Scan this code to keep your account" moves the victim to their phone, where
 * the address is tiny and no extension is watching. Pagida reads the code
 * here instead and checks where it leads like any other link. Only images the
 * email already displays are read, so no new request reveals that the email
 * was opened.
 */
import jsQR from 'jsqr';

const MAX_SIDE = 800;

export async function decodeQr(imageUrl: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(imageUrl, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size > 5_000_000 || /svg/i.test(blob.type)) return null;
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, w, h);
    const found = jsQR(ctx.getImageData(0, 0, w, h).data, w, h);
    return found?.data ?? null;
  } catch {
    return null;
  }
}
