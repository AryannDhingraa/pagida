/**
 * Iris — Pagida's face.
 *
 * She is drawn entirely in CSS and inline SVG rather than shipped as an image,
 * for one reason: she has to change expression the instant a verdict does, and
 * a PNG cannot. Everything here is transform and opacity, so it stays cheap
 * enough to run on every page the user opens.
 *
 * The stylesheet lives in this file as a string rather than in a .css file so
 * that there is exactly one source of truth — the extension pages inject it,
 * and so does the content script, into its closed shadow root.
 */

export type Band = 'clean' | 'caution' | 'suspicious' | 'danger';

/**
 * Every face Iris can pull. Most map to a risk band, but several exist purely
 * to acknowledge something the person did — which is most of what makes her
 * feel like a character rather than an icon.
 */
export type Expression =
  | 'calm'       // resting. nothing to report.
  | 'happy'      // this page is fine.
  | 'curious'    // something mildly interesting.
  | 'thinking'   // still working it out.
  | 'worried'    // suspicious.
  | 'alarmed'    // likely phishing.
  | 'angry'      // you reported this site, or she is certain it is malicious.
  | 'sad'        // you overruled her, or a lookup failed.
  | 'sleepy'     // Pagida is switched off.
  | 'surprised'  // a verdict just changed under her.
  | 'proud';     // thanks for reporting that.

export interface IrisOptions {
  /** Rendered size in pixels. */
  size?: number;
  /** Follow the pointer, blink, tilt, squash on click. Off for icons. */
  interactive?: boolean;
  /** Draw the face at all. At 16px it is mud, so the icon drops it. */
  face?: boolean;
  /** Document to attach pointer listeners to (a shadow root's host document). */
  listenOn?: Document;
}

/** Aurora ramps. Cool to hot, with violet kept out of the warm bands so that
 *  risk is readable from colour alone by someone who never reads the words. */
const AURORA: Record<Band, [string, string, string]> = {
  clean:      ['#6FEBDA', '#7BB4FF', '#B49BFF'],
  caution:    ['#8FD0FF', '#5C9AF7', '#7C88FF'],
  suspicious: ['#FFDC7E', '#FFA83D', '#F47F2A'],
  danger:     ['#FF8A6B', '#E63A2B', '#BB1A0F'],
};

const FACE_SVG = `
<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
  <g class="ir-brows">
    <path class="ir-stroke ir-brow-l" d="M 24 35 Q 33 26 43 33"/>
    <path class="ir-stroke ir-brow-r" d="M 57 33 Q 67 26 76 35"/>
  </g>
  <g class="ir-eyes">
    <circle class="ir-eye ir-eye-l" cx="34" cy="54" r="6.4"/>
    <circle class="ir-eye ir-eye-r" cx="66" cy="54" r="6.4"/>
    <circle class="ir-spark ir-spark-l" cx="36.4" cy="51.4" r="1.9"/>
    <circle class="ir-spark ir-spark-r" cx="68.4" cy="51.4" r="1.9"/>
  </g>
  <path class="ir-stroke ir-nose" d="M 50 52 L 50 65 L 57 65"/>
  <g class="ir-mouths">
    <path class="ir-stroke ir-m ir-m-smile" d="M 40 75 Q 50 82 60 75"/>
    <path class="ir-stroke ir-m ir-m-flat"  d="M 42 77 L 58 77"/>
    <path class="ir-stroke ir-m ir-m-frown" d="M 40 80 Q 50 73 60 80"/>
    <ellipse class="ir-stroke ir-m ir-m-o" cx="50" cy="77" rx="4.6" ry="5.4"/>
  </g>
  <g class="ir-blush">
    <ellipse class="ir-blush-l" cx="24" cy="65" rx="6" ry="3.4"/>
    <ellipse class="ir-blush-r" cx="76" cy="65" rx="6" ry="3.4"/>
  </g>
  <path class="ir-tear" d="M 78 44 q 4 7 0 9 q -4 -2 0 -9 Z"/>
</svg>`;

export const IRIS_CSS = `
.iris {
  position: relative;
  display: grid;
  place-items: center;
  width: var(--ir-size, 120px);
  height: var(--ir-size, 120px);
  flex: 0 0 auto;
  --ir-eyeX: 0px; --ir-eyeY: 0px; --ir-blink: 1;
  --ir-tiltX: 0deg; --ir-tiltY: 0deg;
  --ir-sx: 1; --ir-sy: 1;
  transform: perspective(600px) rotateX(var(--ir-tiltX)) rotateY(var(--ir-tiltY))
             scale(var(--ir-sx), var(--ir-sy));
  transition: transform 460ms cubic-bezier(.22,1,.36,1);
}
.iris.ir-interactive { cursor: pointer; touch-action: none; }
.iris.ir-float { animation: ir-bob 4.6s ease-in-out infinite; }
@keyframes ir-bob { 0%,100% { translate: 0 0 } 50% { translate: 0 -7% } }

.iris .ir-g { position: absolute; border-radius: 50%; pointer-events: none;
  filter: blur(calc(var(--ir-size,120px) * .085));
  transition: background 700ms cubic-bezier(.22,1,.36,1), inset 500ms cubic-bezier(.22,1,.36,1); }
.iris .ir-g1 { inset: 4%;  background: radial-gradient(circle at 36% 28%, var(--ir-c1) 0%, transparent 70%); opacity: .96 }
.iris .ir-g2 { inset: 8%;  background: radial-gradient(circle at 72% 66%, var(--ir-c2) 0%, transparent 68%); opacity: .92;
  animation: ir-drift 9s cubic-bezier(.22,1,.36,1) infinite alternate }
.iris .ir-g3 { inset: 13%; background: radial-gradient(circle at 44% 80%, var(--ir-c3) 0%, transparent 64%); opacity: .82;
  animation: ir-drift 11s cubic-bezier(.22,1,.36,1) infinite alternate-reverse }
@keyframes ir-drift { 0% { transform: translate(0,0) scale(1) } 100% { transform: translate(5%,-6%) scale(1.08) } }

.iris .ir-core { position: absolute; inset: 19%; border-radius: 50%; pointer-events: none;
  background: radial-gradient(circle at 40% 32%, rgba(255,255,255,.6), rgba(255,255,255,0) 62%);
  filter: blur(calc(var(--ir-size,120px) * .03)); }

.iris svg { position: relative; width: 78%; height: 78%; overflow: visible; pointer-events: none; }
.iris .ir-stroke { stroke: #fff; fill: none; stroke-width: 3.6; stroke-linecap: round; stroke-linejoin: round; }
.iris .ir-nose { stroke-width: 3.2; }
.iris .ir-eye { fill: #fff; stroke: none; transition: r 320ms cubic-bezier(.22,1,.36,1); }
.iris .ir-spark { fill: rgba(255,255,255,.85); stroke: none; transition: opacity 300ms; }
.iris .ir-eyes {
  transform: translate(var(--ir-eyeX), var(--ir-eyeY)) scaleY(var(--ir-blink));
  transform-origin: 50px 54px;
  transition: transform 150ms ease-out;
}
.iris .ir-brow-l, .iris .ir-brow-r {
  transform-origin: center;
  transition: transform 400ms cubic-bezier(.22,1,.36,1);
}
.iris .ir-m { opacity: 0; transition: opacity 320ms cubic-bezier(.22,1,.36,1); }
.iris .ir-m-o { fill: none; }
.iris .ir-blush-l, .iris .ir-blush-r {
  fill: rgba(255,255,255,.55); stroke: none; opacity: 0;
  transition: opacity 400ms cubic-bezier(.22,1,.36,1);
}
.iris .ir-tear { fill: rgba(255,255,255,.9); stroke: none; opacity: 0; transform-origin: 78px 44px;
  transition: opacity 400ms cubic-bezier(.22,1,.36,1); }

/* ---------- expressions ---------- */

.iris[data-face="calm"] .ir-m-flat { opacity: .55 }

.iris[data-face="happy"] .ir-m-smile { opacity: 1 }
.iris[data-face="happy"] .ir-blush-l,
.iris[data-face="happy"] .ir-blush-r { opacity: 1 }

.iris[data-face="curious"] .ir-brow-r { transform: translateY(-6px) rotate(-7deg) }
.iris[data-face="curious"] .ir-m-flat { opacity: .5 }

.iris[data-face="thinking"] .ir-brow-l { transform: translateY(-4px) rotate(4deg) }
.iris[data-face="thinking"] .ir-eyes { transform: translate(-4px, -3px) scaleY(var(--ir-blink)) }
.iris[data-face="thinking"] .ir-m-flat { opacity: .5 }

.iris[data-face="worried"] .ir-brow-l { transform: translateY(4px) rotate(13deg) }
.iris[data-face="worried"] .ir-brow-r { transform: translateY(4px) rotate(-13deg) }
.iris[data-face="worried"] .ir-eye { r: 7.2 }
.iris[data-face="worried"] .ir-m-frown { opacity: .8 }
.iris[data-face="worried"] .ir-tear { opacity: .85; animation: ir-drop 2.6s ease-in-out infinite }
@keyframes ir-drop { 0%,70%,100% { transform: translateY(0); opacity: .85 } 85% { transform: translateY(10px); opacity: 0 } }

.iris[data-face="alarmed"] .ir-brow-l { transform: translateY(7px) rotate(22deg) }
.iris[data-face="alarmed"] .ir-brow-r { transform: translateY(7px) rotate(-22deg) }
.iris[data-face="alarmed"] .ir-eye { r: 8.4 }
.iris[data-face="alarmed"] .ir-m-o { opacity: .9 }
.iris[data-face="alarmed"] { animation: ir-bob 4.6s ease-in-out infinite, ir-shudder 1.05s ease-in-out infinite }
@keyframes ir-shudder { 0%,100% { filter: none } 50% { filter: brightness(1.16) saturate(1.35) } }

.iris[data-face="angry"] .ir-brow-l { transform: translateY(9px) rotate(26deg) }
.iris[data-face="angry"] .ir-brow-r { transform: translateY(9px) rotate(-26deg) }
.iris[data-face="angry"] .ir-eye { r: 5.4 }
.iris[data-face="angry"] .ir-spark { opacity: 0 }
.iris[data-face="angry"] .ir-m-frown { opacity: 1 }

.iris[data-face="sad"] .ir-brow-l { transform: translateY(2px) rotate(-14deg) }
.iris[data-face="sad"] .ir-brow-r { transform: translateY(2px) rotate(14deg) }
.iris[data-face="sad"] .ir-eyes { transform: translate(var(--ir-eyeX), 3px) scaleY(var(--ir-blink)) }
.iris[data-face="sad"] .ir-m-frown { opacity: .85 }

.iris[data-face="sleepy"] .ir-eyes { transform: translate(0,2px) scaleY(.18) }
.iris[data-face="sleepy"] .ir-brow-l { transform: translateY(4px) }
.iris[data-face="sleepy"] .ir-brow-r { transform: translateY(4px) }
.iris[data-face="sleepy"] .ir-m-flat { opacity: .4 }

.iris[data-face="surprised"] .ir-brow-l { transform: translateY(-7px) }
.iris[data-face="surprised"] .ir-brow-r { transform: translateY(-7px) }
.iris[data-face="surprised"] .ir-eye { r: 8.8 }
.iris[data-face="surprised"] .ir-m-o { opacity: 1 }

.iris[data-face="proud"] .ir-m-smile { opacity: 1 }
.iris[data-face="proud"] .ir-blush-l,
.iris[data-face="proud"] .ir-blush-r { opacity: 1 }
.iris[data-face="proud"] .ir-eye-r { r: 1.6 }
.iris[data-face="proud"] .ir-spark-r { opacity: 0 }
.iris[data-face="proud"] .ir-brow-r { transform: translateY(-4px) }

/* hover — she notices you */
.iris.ir-interactive:hover .ir-eye { r: 7.6 }

@media (prefers-reduced-motion: reduce) {
  .iris, .iris .ir-g2, .iris .ir-g3, .iris .ir-tear { animation: none !important }
  .iris * { transition-duration: 1ms !important }
}
`;

let cssInjected = false;

/** Adds the Iris stylesheet to a document or shadow root, exactly once each. */
export function injectIrisCss(root: Document | ShadowRoot): void {
  if (root instanceof Document) {
    if (cssInjected) return;
    cssInjected = true;
  }
  const style = document.createElement('style');
  style.textContent = IRIS_CSS;
  (root instanceof Document ? root.head : root).appendChild(style);
}

/** The face Iris wears for a given verdict, absent anything more specific. */
export function expressionForBand(band: Band): Expression {
  switch (band) {
    case 'danger': return 'alarmed';
    case 'suspicious': return 'worried';
    case 'caution': return 'curious';
    default: return 'happy';
  }
}

export class Iris {
  readonly el: HTMLElement;
  private blinkTimer: ReturnType<typeof setTimeout> | undefined;
  private revertTimer: ReturnType<typeof setTimeout> | undefined;
  private baseExpression: Expression = 'calm';
  private pointerHandler: ((e: PointerEvent) => void) | undefined;
  private listenOn: Document;

  constructor(host: HTMLElement, opts: IrisOptions = {}) {
    const { size = 120, interactive = true, face = true, listenOn = document } = opts;
    this.listenOn = listenOn;

    this.el = host;
    this.el.classList.add('iris');
    this.el.style.setProperty('--ir-size', `${size}px`);
    this.el.innerHTML =
      '<div class="ir-g ir-g1"></div><div class="ir-g ir-g2"></div>' +
      '<div class="ir-g ir-g3"></div><div class="ir-core"></div>' +
      (face ? FACE_SVG : '');

    this.setBand('clean');
    this.setExpression('calm');

    if (interactive && face) {
      this.el.classList.add('ir-interactive', 'ir-float');
      this.startBlinking();
      this.trackPointer();
      this.enableSquash();
    } else if (face) {
      this.startBlinking();
    }
  }

  /** Recolours the aurora. Independent of expression on purpose — a page can be
   *  low-risk while Iris is briefly surprised, and both should be visible. */
  setBand(band: Band): void {
    const [c1, c2, c3] = AURORA[band] ?? AURORA.clean;
    this.el.style.setProperty('--ir-c1', c1);
    this.el.style.setProperty('--ir-c2', c2);
    this.el.style.setProperty('--ir-c3', c3);
  }

  setExpression(expression: Expression): void {
    if (this.revertTimer) { clearTimeout(this.revertTimer); this.revertTimer = undefined; }
    this.baseExpression = expression;
    this.el.dataset.face = expression;
  }

  /** Pull a face for a moment, then go back to whatever she was doing. Used for
   *  acknowledging a click — reporting a site makes her briefly angry, marking
   *  one safe makes her briefly sad. */
  react(expression: Expression, ms = 1600): void {
    if (this.revertTimer) clearTimeout(this.revertTimer);
    this.el.dataset.face = expression;
    this.revertTimer = setTimeout(() => {
      this.el.dataset.face = this.baseExpression;
      this.revertTimer = undefined;
    }, ms);
  }

  destroy(): void {
    if (this.blinkTimer) clearTimeout(this.blinkTimer);
    if (this.revertTimer) clearTimeout(this.revertTimer);
    if (this.pointerHandler) this.listenOn.removeEventListener('pointermove', this.pointerHandler);
  }

  // ---------------------------------------------------------------- behaviour

  /** Blinks on a loose timer, and doubles up now and then. A fixed interval
   *  reads as a machine; the irregularity is most of the effect. */
  private startBlinking(): void {
    const once = (then?: () => void) => {
      this.el.style.setProperty('--ir-blink', '.08');
      setTimeout(() => {
        this.el.style.setProperty('--ir-blink', '1');
        then?.();
      }, 125);
    };
    const loop = () => {
      // She does not blink while her eyes are already shut.
      if (this.el.dataset.face !== 'sleepy') {
        once(() => { if (Math.random() < 0.24) setTimeout(() => once(), 190); });
      }
      this.blinkTimer = setTimeout(loop, 2400 + Math.random() * 4200);
    };
    this.blinkTimer = setTimeout(loop, 700 + Math.random() * 2200);
  }

  /** Eyes and head follow the pointer, damped so she glances rather than stares. */
  private trackPointer(): void {
    this.pointerHandler = (e: PointerEvent) => {
      const r = this.el.getBoundingClientRect();
      if (!r.width) return;
      const dx = clamp((e.clientX - (r.left + r.width / 2)) / (r.width * 1.7));
      const dy = clamp((e.clientY - (r.top + r.height / 2)) / (r.height * 1.7));
      this.el.style.setProperty('--ir-eyeX', `${(dx * 4.4).toFixed(2)}px`);
      this.el.style.setProperty('--ir-eyeY', `${(dy * 3.2).toFixed(2)}px`);
      this.el.style.setProperty('--ir-tiltY', `${(dx * 7).toFixed(2)}deg`);
      this.el.style.setProperty('--ir-tiltX', `${(-dy * 5).toFixed(2)}deg`);
    };
    this.listenOn.addEventListener('pointermove', this.pointerHandler, { passive: true });
  }

  /** Squash on press, overshoot on release. Costs nothing, reads as alive. */
  private enableSquash(): void {
    const set = (sx: string, sy: string) => {
      this.el.style.setProperty('--ir-sx', sx);
      this.el.style.setProperty('--ir-sy', sy);
    };
    this.el.addEventListener('pointerdown', () => set('1.08', '.9'));
    const release = () => {
      set('.95', '1.06');
      setTimeout(() => set('1', '1'), 180);
    };
    this.el.addEventListener('pointerup', release);
    this.el.addEventListener('pointercancel', release);
    this.el.addEventListener('pointerleave', () => {
      this.el.style.setProperty('--ir-tiltX', '0deg');
      this.el.style.setProperty('--ir-tiltY', '0deg');
    });
  }
}

function clamp(n: number): number {
  return Math.max(-1, Math.min(1, n));
}
