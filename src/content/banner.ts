/**
 * The in-page warning bar.
 *
 * Only ever shown for the top band, always dismissible, and rendered inside a
 * closed shadow root so the page's own CSS cannot restyle it and the page's own
 * scripts cannot read or remove it through the normal DOM.
 */
import type { Verdict } from '../core/types.js';

const HOST_ID = 'pagida-warning-host';

const CSS = `
:host { all: initial; }
.bar {
  position: fixed; inset: 0 0 auto 0; z-index: 2147483647;
  display: flex; align-items: flex-start; gap: 14px;
  padding: 14px 16px;
  background: #17090A; border-bottom: 2px solid #F87171;
  color: #F4E7E7; box-shadow: 0 8px 24px rgba(0,0,0,.5);
  font: 500 13px/1.5 ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}
.mark { color: #F87171; font-weight: 700; letter-spacing: .12em; white-space: nowrap; padding-top: 1px; }
.body { flex: 1; min-width: 0; }
.title { color: #FCA5A5; font-weight: 700; margin-bottom: 4px; }
.detail { color: #C9B7B7; font-size: 12px; }
.detail li { margin: 2px 0; }
ul { margin: 4px 0 0; padding-left: 16px; }
.actions { display: flex; gap: 8px; flex-shrink: 0; }
button {
  font: inherit; font-size: 12px; cursor: pointer;
  background: transparent; color: #F4E7E7;
  border: 1px solid #4A2422; border-radius: 3px; padding: 5px 10px;
}
button:hover { border-color: #F87171; color: #FCA5A5; }
button:focus-visible { outline: 2px solid #F87171; outline-offset: 2px; }
button.leave { background: #F87171; color: #17090A; border-color: #F87171; font-weight: 700; }
button.leave:hover { background: #FCA5A5; }
@media (prefers-reduced-motion: no-preference) {
  .bar { animation: drop .18s ease-out; }
  @keyframes drop { from { transform: translateY(-100%); } to { transform: none; } }
}
`;

export function hideBanner(): void {
  document.getElementById(HOST_ID)?.remove();
}

export function showBanner(verdict: Verdict, onMarkSafe: () => void): void {
  hideBanner();
  if (!document.body) return;

  const host = document.createElement('div');
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = CSS;

  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.setAttribute('role', 'alert');

  const mark = document.createElement('div');
  mark.className = 'mark';
  mark.textContent = `[ ${verdict.score} ]`;

  const body = document.createElement('div');
  body.className = 'body';
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = 'Pagida thinks this page is a phishing attempt.';
  const detail = document.createElement('div');
  detail.className = 'detail';
  const list = document.createElement('ul');
  for (const s of verdict.signals.filter((x) => x.weight > 0).slice(0, 3)) {
    const li = document.createElement('li');
    li.textContent = s.title;
    list.appendChild(li);
  }
  detail.appendChild(list);
  body.append(title, detail);

  const actions = document.createElement('div');
  actions.className = 'actions';

  const leave = document.createElement('button');
  leave.className = 'leave';
  leave.textContent = 'Go back';
  leave.addEventListener('click', () => {
    if (history.length > 1) history.back();
    else location.href = 'about:blank';
  });

  const safe = document.createElement('button');
  safe.textContent = 'This is fine';
  safe.addEventListener('click', () => { onMarkSafe(); hideBanner(); });

  const dismiss = document.createElement('button');
  dismiss.textContent = 'Dismiss';
  dismiss.setAttribute('aria-label', 'Dismiss this warning');
  dismiss.addEventListener('click', hideBanner);

  actions.append(leave, safe, dismiss);
  bar.append(mark, body, actions);
  root.append(style, bar);
  document.documentElement.appendChild(host);
}
