/**
 * Iris, on the page.
 *
 * She lives in a closed shadow root attached to the document element, so the
 * page cannot restyle her, cannot read her, and cannot reach into her with a
 * querySelector. A determined page can still remove the host node — which is
 * why the toolbar badge, not this, is the authoritative indicator.
 *
 * She is draggable and remembers where she was put, because a fixed bubble in
 * the corner is the thing that covers the one control you needed.
 */
import type { Verdict } from '../core/types.js';
import { adviceFor, headlineFor } from '../core/score.js';
import { Iris, expressionForBand, injectIrisCss, IRIS_CSS } from '../ui/iris.js';

const HOST_ID = 'pagida-companion-host';
const POSITION_KEY = 'pagida:companion-position';

const CSS = `
:host { all: initial; }
.wrap {
  position: fixed; z-index: 2147483647;
  display: flex; align-items: flex-end; gap: 10px; flex-direction: row-reverse;
  font: 400 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  cursor: grab; touch-action: none; user-select: none;
}
.wrap.dragging { cursor: grabbing; }
.bubble {
  background: #fff; border: 1px solid var(--edge, #F8CFC9);
  border-radius: 16px 16px 4px 16px; padding: 12px 14px; max-width: 250px;
  box-shadow: 0 2px 6px rgba(27,30,36,.06), 0 24px 50px -26px rgba(27,30,36,.34);
  color: #1B1E24; cursor: default;
  opacity: 0; transform: translateY(8px) scale(.96); transform-origin: bottom right;
  transition: opacity 320ms cubic-bezier(.22,1,.36,1), transform 320ms cubic-bezier(.22,1,.36,1);
}
.bubble.show { opacity: 1; transform: none; }
.bubble b { display: block; color: var(--tone, #DC3E31); font-size: 13.5px; margin-bottom: 3px; }
.bubble p { margin: 0; color: #5A6371; font-size: 12.5px; }
.row { display: flex; gap: 7px; margin-top: 11px; }
.row button {
  font: inherit; font-size: 11.5px; font-weight: 600; cursor: pointer;
  border-radius: 999px; padding: 6px 12px; border: 1px solid #ECEAE4;
  background: #fff; color: #5A6371;
}
.row button:hover { border-color: #8A929E; color: #1B1E24; }
.row button.solid { background: var(--tone, #DC3E31); border-color: var(--tone, #DC3E31); color: #fff; }
.close {
  position: absolute; top: -8px; right: -8px; width: 22px; height: 22px; border-radius: 50%;
  border: 1px solid #ECEAE4; background: #fff; color: #8A929E; cursor: pointer;
  font: 700 13px/1 sans-serif; display: grid; place-items: center; padding: 0;
}
.holder { position: relative; }
${IRIS_CSS}
`;

const TONES: Record<string, string> = {
  clean: '#12A672', caution: '#3D7FEA', suspicious: '#C67C0A', danger: '#DC3E31',
};
const EDGES: Record<string, string> = {
  clean: '#C9EDDD', caution: '#CFE0FB', suspicious: '#F6E3BC', danger: '#F8CFC9',
};

let host: HTMLElement | undefined;
let iris: Iris | undefined;

export function hideCompanion(): void {
  document.getElementById(HOST_ID)?.remove();
  iris?.destroy();
  iris = undefined;
  host = undefined;
}

interface CompanionActions {
  onTrust: () => void;
  onReport: () => void;
  onExplain: () => void;
}

export function showCompanion(verdict: Verdict, actions: CompanionActions): void {
  hideCompanion();
  if (!document.body) return;

  host = document.createElement('div');
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = CSS;

  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  wrap.setAttribute('role', 'alert');

  const holder = document.createElement('div');
  holder.className = 'holder';
  const irisEl = document.createElement('div');
  irisEl.style.setProperty('--ir-size', '62px');
  holder.appendChild(irisEl);

  const bubble = document.createElement('div');
  bubble.className = 'bubble show';
  bubble.style.setProperty('--tone', TONES[verdict.band] ?? TONES.danger!);
  bubble.style.setProperty('--edge', EDGES[verdict.band] ?? EDGES.danger!);

  const title = document.createElement('b');
  title.textContent = headlineFor(verdict);
  const body = document.createElement('p');
  body.textContent = adviceFor(verdict);

  const row = document.createElement('div');
  row.className = 'row';
  const why = document.createElement('button');
  why.className = 'solid';
  why.textContent = 'Show me why';
  why.addEventListener('click', actions.onExplain);
  const fine = document.createElement('button');
  fine.textContent = 'It is fine';
  fine.addEventListener('click', () => { actions.onTrust(); hideCompanion(); });
  row.append(why, fine);

  const close = document.createElement('button');
  close.className = 'close';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Hide Iris on this page');
  close.addEventListener('click', hideCompanion);

  bubble.append(title, body, row, close);
  wrap.append(holder, bubble);
  root.append(style, wrap);
  document.documentElement.appendChild(host);

  injectIrisCss(root);
  iris = new Iris(irisEl, { size: 62, interactive: true, listenOn: document });
  iris.setBand(verdict.band);
  iris.setExpression(expressionForBand(verdict.band));

  placeAndDrag(wrap);
}

/** Restores her last position, keeps her on screen, and makes her draggable. */
function placeAndDrag(wrap: HTMLElement): void {
  let saved: { x: number; y: number } | null = null;
  try { saved = JSON.parse(sessionStorage.getItem(POSITION_KEY) ?? 'null'); } catch { saved = null; }

  const clampToViewport = (x: number, y: number) => ({
    x: Math.max(8, Math.min(window.innerWidth - wrap.offsetWidth - 8, x)),
    y: Math.max(8, Math.min(window.innerHeight - wrap.offsetHeight - 8, y)),
  });

  const place = (x: number, y: number) => {
    const p = clampToViewport(x, y);
    wrap.style.left = `${p.x}px`;
    wrap.style.top = `${p.y}px`;
    wrap.style.right = 'auto';
    wrap.style.bottom = 'auto';
  };

  if (saved) place(saved.x, saved.y);
  else {
    wrap.style.right = '22px';
    wrap.style.bottom = '22px';
  }

  let dragging = false;
  let startX = 0, startY = 0, originX = 0, originY = 0, moved = false;

  wrap.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('.bubble')) return;
    dragging = true;
    moved = false;
    wrap.classList.add('dragging');
    wrap.setPointerCapture(e.pointerId);
    const r = wrap.getBoundingClientRect();
    originX = r.left;
    originY = r.top;
    startX = e.clientX;
    startY = e.clientY;
    place(originX, originY);
  });

  wrap.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
    place(originX + dx, originY + dy);
  });

  const stop = () => {
    if (!dragging) return;
    dragging = false;
    wrap.classList.remove('dragging');
    if (moved) {
      const r = wrap.getBoundingClientRect();
      try { sessionStorage.setItem(POSITION_KEY, JSON.stringify({ x: r.left, y: r.top })); } catch { /* private mode */ }
    }
  };
  wrap.addEventListener('pointerup', stop);
  wrap.addEventListener('pointercancel', stop);

  window.addEventListener('resize', () => {
    const r = wrap.getBoundingClientRect();
    if (wrap.style.left) place(r.left, r.top);
  }, { passive: true });
}
