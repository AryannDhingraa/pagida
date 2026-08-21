/**
 * Link check page.
 *
 * Reached from the right-click menu. The whole point is that the link is scored
 * *without being opened* — so this page never navigates to the target, never
 * fetches it, and never renders anything from it. Only URL-tier rules plus the
 * blocklist and domain-age lookups apply, and the page says so rather than
 * implying a full page inspection happened.
 */
import type { Verdict } from '../core/types.js';
import { BAND_LABELS } from '../core/score.js';
import type { Message } from '../shared/messages.js';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const params = new URLSearchParams(location.search);
const target = params.get('u') ?? '';
const wasReported = params.get('reported') === '1';

function render(verdict: Verdict): void {
  document.documentElement.setAttribute('data-band', verdict.band);
  $('state').hidden = true;
  $('readout').hidden = false;
  $('actions').hidden = false;

  $('score').textContent = String(verdict.score);
  ($('meter-fill') as HTMLElement).style.width = `${Math.max(verdict.score, 2)}%`;
  $('verdict').textContent = BAND_LABELS[verdict.band];
  $('scope').textContent =
    'Scored from the address, the community blocklist and the domain age. ' +
    'The page itself was not opened, so nothing about its content was checked.';

  const list = $<HTMLUListElement>('signals');
  list.replaceChildren();
  for (const s of verdict.signals) {
    const li = document.createElement('li');
    const t = document.createElement('span'); t.className = 't'; t.textContent = s.title;
    const w = document.createElement('span'); w.className = 'w';
    w.textContent = s.weight === 0 ? '—' : `${s.weight > 0 ? '+' : ''}${s.weight}`;
    const d = document.createElement('span'); d.className = 'd'; d.textContent = s.detail;
    li.append(t, w, d);
    list.appendChild(li);
  }
  if (verdict.signals.length === 0) {
    const li = document.createElement('li');
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = 'Nothing suspicious in this address.';
    li.append(t);
    list.appendChild(li);
  }
}

async function init(): Promise<void> {
  if (!target) { $('state').textContent = 'No link was passed to this page.'; return; }
  $('target').textContent = target;
  $('reported').hidden = !wasReported;

  const res = await chrome.runtime.sendMessage({ type: 'CHECK_URL', url: target } satisfies Message)
    .catch(() => null);
  if (res?.ok && res.verdict) render(res.verdict);
  else $('state').textContent = 'Pagida cannot check this kind of link.';
}

$('report').addEventListener('click', () => void (async () => {
  await chrome.runtime.sendMessage({ type: 'MARK_SITE', url: target, verdict: 'phishing' } satisfies Message);
  $('reported').hidden = false;
  $<HTMLButtonElement>('report').disabled = true;
  $<HTMLButtonElement>('report').textContent = 'reported';
})());

$('open').addEventListener('click', () => { location.href = target; });
$('close').addEventListener('click', () => void (async () => {
  const tab = await chrome.tabs.getCurrent();
  if (tab?.id !== undefined) await chrome.tabs.remove(tab.id);
})());

void init();
