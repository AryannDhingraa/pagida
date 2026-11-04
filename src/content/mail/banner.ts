/**
 * What the reader sees on a dangerous email: one card above the message, and
 * a check before any flagged link opens.
 *
 * The card sits in a closed shadow root, so neither the email's own HTML nor
 * the webmail's styles can restyle or hide it. It only appears when the
 * engine reached a conclusion it can say in one sentence; "Worth a look"
 * emails get nothing, because a warning on every newsletter would be ignored.
 */
import type { EmailVerdict, LinkFinding } from '../../email/types.js';
import { Iris, expressionForBand, injectIrisCss, IRIS_CSS } from '../../ui/iris.js';

const TONES = { clean: '#12A672', caution: '#3D7FEA', suspicious: '#C67C0A', danger: '#DC3E31' } as const;
const TINTS = { clean: '#EEF9F4', caution: '#EEF4FD', suspicious: '#FDF6E8', danger: '#FDEEEC' } as const;

const CSS = `
:host { all: initial; display: block; margin: 0 0 14px; }
.card { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 14px;
  background: var(--tint); border: 1px solid var(--tone);
  font: 400 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1B1E24; }
.main { flex: 1; min-width: 0; }
b { display: block; color: var(--tone); font-size: 14px; margin-bottom: 2px; }
p { margin: 0; color: #3B424D; }
ul { margin: 8px 0 0; padding-left: 18px; color: #3B424D; }
li { margin: 2px 0; }
.row { display: flex; gap: 8px; margin-top: 9px; }
button { font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; border-radius: 999px;
  padding: 5px 12px; border: 1px solid #D9D6CF; background: #fff; color: #3B424D; }
button.solid { background: var(--tone); border-color: var(--tone); color: #fff; }
.brand { font-size: 11px; color: #8A929E; margin-top: 6px; }
${IRIS_CSS}
`;

const HOST_CLASS = 'pagida-mail-card';

export function clearBanner(anchor: HTMLElement): void {
  const prev = anchor.previousElementSibling;
  if (prev?.classList.contains(HOST_CLASS)) prev.remove();
}

export function showBanner(anchor: HTMLElement, v: EmailVerdict): void {
  clearBanner(anchor);
  const top = v.conclusions[0];
  if (!top) return;

  const host = document.createElement('div');
  host.className = HOST_CLASS;
  // Readable from outside the closed root, for tests and for the page's own a11y tools.
  host.dataset.band = v.band;
  host.dataset.conclusions = v.conclusions.map((c) => c.id).join(' ');
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = CSS;

  const card = document.createElement('div');
  card.className = 'card';
  card.setAttribute('role', 'alert');
  card.style.setProperty('--tone', TONES[v.band]);
  card.style.setProperty('--tint', TINTS[v.band]);

  const irisEl = document.createElement('div');
  irisEl.style.setProperty('--ir-size', '44px');
  const main = document.createElement('div');
  main.className = 'main';
  const title = document.createElement('b');
  title.textContent = top.title;
  const detail = document.createElement('p');
  detail.textContent = top.detail;

  const list = document.createElement('ul');
  list.hidden = true;
  for (const s of v.signals.filter((x) => x.weight > 0).slice(0, 6)) {
    const li = document.createElement('li');
    li.textContent = `${s.title}. ${s.detail}`;
    list.appendChild(li);
  }

  const row = document.createElement('div');
  row.className = 'row';
  const why = document.createElement('button');
  why.className = 'solid';
  why.textContent = 'Show me why';
  why.addEventListener('click', () => { list.hidden = !list.hidden; why.textContent = list.hidden ? 'Show me why' : 'Hide'; });
  const ok = document.createElement('button');
  ok.textContent = 'I know this sender';
  ok.addEventListener('click', () => host.remove());
  row.append(why, ok);

  const brand = document.createElement('div');
  brand.className = 'brand';
  brand.textContent = 'Checked by Pagida. The email itself never leaves this computer.';

  main.append(title, detail, list, row, brand);
  card.append(irisEl, main);
  root.append(style, card);
  anchor.parentElement?.insertBefore(host, anchor);

  injectIrisCss(root);
  const iris = new Iris(irisEl, { size: 44, interactive: false });
  iris.setBand(v.band);
  iris.setExpression(expressionForBand(v.band));
}

/**
 * A flagged link asks before it opens. Capture phase, so the webmail's own
 * click handlers never see a click the person did not confirm.
 */
export function guardLinks(body: HTMLElement, findings: LinkFinding[], unwrap: (h: string) => string): void {
  const risky = new Map(findings.map((f) => [f.href, f]));
  if (risky.size === 0 || body.dataset.pagidaGuarded === '1') return;
  body.dataset.pagidaGuarded = '1';
  body.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a) return;
    const f = risky.get(unwrap(a.href));
    if (!f) return;
    let host = f.href;
    try { host = new URL(f.href).hostname; } catch { /* keep raw */ }
    const why = f.listed ? 'It is on a list of phishing sites.' : `${(f.reason ?? 'Pagida flags it').replace(/\.$/, '')}.`;
    // A native confirm is the one dialog a page cannot draw over or fake.
    if (!window.confirm(`Pagida: this link opens ${host}.\n\n${why}\n\nOpen it anyway?`)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);
}
