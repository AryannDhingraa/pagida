/**
 * The toolbar icon, drawn at runtime so it can move.
 *
 * A static PNG cannot react, and the toolbar is the one part of the interface a
 * hostile page can never touch — so it is worth spending a little effort on. The
 * icon is Iris's head rendered into an OffscreenCanvas in the service worker and
 * handed to `chrome.action.setIcon` frame by frame.
 *
 * Deliberately bounded: animations are short bursts triggered by something
 * happening, never a permanent loop. A browser extension that repaints its icon
 * forever is an extension that shows up in the battery report.
 */
import type { Band } from '../core/types.js';

const SIZE = 32;

/** Matches the aurora ramps in src/ui/iris.ts, so toolbar and popup agree. */
const AURORA: Record<Band, [string, string, string]> = {
  clean: ['#6FEBDA', '#7BB4FF', '#B49BFF'],
  caution: ['#8FD0FF', '#5C9AF7', '#7C88FF'],
  suspicious: ['#FFDC7E', '#FFA83D', '#F47F2A'],
  danger: ['#FF8A6B', '#E63A2B', '#BB1A0F'],
};

let canvas: OffscreenCanvas | undefined;
let ctx: OffscreenCanvasRenderingContext2D | null = null;

function context(): OffscreenCanvasRenderingContext2D | null {
  if (!ctx) {
    try {
      canvas = new OffscreenCanvas(SIZE, SIZE);
      ctx = canvas.getContext('2d');
    } catch {
      return null; // very old Chrome, or a worker without canvas
    }
  }
  return ctx;
}

interface FrameState {
  band: Band;
  /** 0 = resting, 1 = fully squashed. Drives the little bounce. */
  squash: number;
  /** 0 = eyes open, 1 = shut. */
  blink: number;
  /** Extra brightness, 0..1, for the alarmed pulse. */
  glow: number;
}

function drawFrame(state: FrameState): ImageData | null {
  const c = context();
  if (!c || !canvas) return null;

  const [c1, c2, c3] = AURORA[state.band] ?? AURORA.clean;
  c.clearRect(0, 0, SIZE, SIZE);

  const squashY = 1 - state.squash * 0.12;
  const squashX = 1 + state.squash * 0.10;

  c.save();
  c.translate(SIZE / 2, SIZE / 2);
  c.scale(squashX, squashY);
  c.translate(-SIZE / 2, -SIZE / 2);

  // The orb: a white disc with three soft aurora blooms over it.
  c.save();
  c.beginPath();
  c.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2);
  c.clip();

  c.fillStyle = '#FFFFFF';
  c.fillRect(0, 0, SIZE, SIZE);

  const bloom = (colour: string, x: number, y: number, r: number) => {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, colour);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, SIZE, SIZE);
  };
  bloom(c1, SIZE * 0.36, SIZE * 0.30, SIZE * 0.62);
  bloom(c2, SIZE * 0.72, SIZE * 0.66, SIZE * 0.60);
  bloom(c3, SIZE * 0.42, SIZE * 0.82, SIZE * 0.56);

  if (state.glow > 0) {
    c.fillStyle = `rgba(255,255,255,${state.glow * 0.30})`;
    c.fillRect(0, 0, SIZE, SIZE);
  }
  c.restore();

  // The face. Kept to brows, eyes and the L nose — a mouth at this size is mud.
  c.strokeStyle = '#FFFFFF';
  c.fillStyle = '#FFFFFF';
  c.lineWidth = SIZE * 0.075;
  c.lineCap = 'round';
  c.lineJoin = 'round';

  const angry = state.band === 'danger' || state.band === 'suspicious';
  const browDrop = angry ? SIZE * 0.045 : 0;
  const browTilt = angry ? 0.30 : 0;

  const brow = (cx: number, dir: number) => {
    c.save();
    c.translate(cx, SIZE * 0.335 + browDrop);
    c.rotate(browTilt * dir);
    c.beginPath();
    c.moveTo(-SIZE * 0.105, SIZE * 0.035);
    c.quadraticCurveTo(0, -SIZE * 0.05, SIZE * 0.105, SIZE * 0.035);
    c.stroke();
    c.restore();
  };
  brow(SIZE * 0.335, 1);
  brow(SIZE * 0.665, -1);

  const eyeR = SIZE * (state.band === 'danger' ? 0.098 : 0.082);
  const openness = 1 - state.blink;
  for (const cx of [SIZE * 0.35, SIZE * 0.65]) {
    c.beginPath();
    c.ellipse(cx, SIZE * 0.545, eyeR, Math.max(eyeR * openness, SIZE * 0.012), 0, 0, Math.PI * 2);
    c.fill();
  }

  c.beginPath();
  c.moveTo(SIZE * 0.50, SIZE * 0.525);
  c.lineTo(SIZE * 0.50, SIZE * 0.655);
  c.lineTo(SIZE * 0.575, SIZE * 0.655);
  c.stroke();

  c.restore();
  return c.getImageData(0, 0, SIZE, SIZE);
}

async function paint(tabId: number | undefined, state: FrameState): Promise<void> {
  const imageData = drawFrame(state);
  if (!imageData) return;
  try {
    await chrome.action.setIcon(tabId === undefined ? { imageData } : { tabId, imageData });
  } catch {
    // Tab closed mid-animation. Nothing to do.
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Cancels an in-flight animation when a newer one starts on the same tab. */
const running = new Map<number, symbol>();

/**
 * A short reaction when a page finishes being scored: a bounce, a blink, and —
 * for the top two bands — a couple of pulses so it catches the eye without
 * becoming a strobe.
 */
export async function animateIcon(tabId: number, band: Band): Promise<void> {
  const token = Symbol('anim');
  running.set(tabId, token);
  const live = () => running.get(tabId) === token;

  const rest: FrameState = { band, squash: 0, blink: 0, glow: 0 };

  // Squash down, spring back.
  for (const squash of [0.35, 0.75, 1, 0.6, 0.2, 0]) {
    if (!live()) return;
    await paint(tabId, { ...rest, squash });
    await sleep(45);
  }

  // Blink.
  for (const blink of [0.5, 1, 1, 0.4, 0]) {
    if (!live()) return;
    await paint(tabId, { ...rest, blink });
    await sleep(40);
  }

  if (band === 'suspicious' || band === 'danger') {
    for (let pulse = 0; pulse < 3; pulse++) {
      for (const glow of [0.25, 0.6, 0.9, 0.6, 0.25, 0]) {
        if (!live()) return;
        await paint(tabId, { ...rest, glow });
        await sleep(55);
      }
      await sleep(160);
    }
  }

  if (!live()) return;
  await paint(tabId, rest);
  running.delete(tabId);
}

/** The still frame, for when a tab first appears or an animation is not wanted. */
export async function setIconBand(tabId: number | undefined, band: Band): Promise<void> {
  running.delete(tabId ?? -1);
  await paint(tabId, { band, squash: 0, blink: 0, glow: 0 });
}
