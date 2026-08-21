/**
 * Popup — the whole user-facing story in 360 pixels.
 *
 * The design rule here: every point of the score must be traceable to a line on
 * screen. A user should never see a number they cannot explain to someone else.
 */
import type { Verdict } from '../core/types.js';
import { BAND_LABELS } from '../core/score.js';
import { getMarks } from '../shared/settings.js';
import type { Message } from '../shared/messages.js';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const el = {
  root: document.documentElement,
  readout: $('readout'),
  fill: $('meter-fill'),
  score: $('score'),
  verdict: $('verdict'),
  host: $('host'),
  signalsSection: $('signals-section'),
  signalCount: $('signal-count'),
  signals: $<HTMLUListElement>('signals'),
  state: $('state'),
  stateText: $('state-text'),
  actions: $('actions'),
  report: $<HTMLButtonElement>('report'),
  trust: $<HTMLButtonElement>('trust'),
  undo: $<HTMLButtonElement>('undo'),
};

let currentUrl = '';
let currentHostname = '';

function setState(text: string): void {
  el.state.hidden = false;
  el.stateText.textContent = text;
  el.readout.hidden = true;
  el.signalsSection.hidden = true;
  el.actions.hidden = true;
}

function render(verdict: Verdict): void {
  el.state.hidden = true;
  el.readout.hidden = false;
  el.actions.hidden = false;
  el.root.setAttribute('data-band', verdict.band);

  el.score.textContent = String(verdict.score);
  el.fill.style.width = `${Math.max(verdict.score, 2)}%`;
  el.verdict.textContent = BAND_LABELS[verdict.band];
  el.host.textContent = verdict.hostname;

  const shown = verdict.signals;
  el.signals.replaceChildren();

  if (shown.length === 0) {
    el.signalsSection.hidden = true;
    el.state.hidden = false;
    el.stateText.textContent = verdict.urlOnly
      ? 'Nothing suspicious in the address. Reload the page for a full check.'
      : 'No warning signs found on this page.';
  } else {
    el.signalsSection.hidden = false;
    el.signalCount.textContent =
      `${shown.length} signal${shown.length === 1 ? '' : 's'}` +
      (verdict.urlOnly ? ' · address only' : '');

    for (const s of shown) {
      const li = document.createElement('li');
      li.dataset.tier = s.tier;
      if (s.weight < 0) li.classList.add('credit');

      const t = document.createElement('span');
      t.className = 't';
      t.textContent = s.title;

      const w = document.createElement('span');
      w.className = 'w';
      w.textContent = s.weight === 0 ? '—' : `${s.weight > 0 ? '+' : ''}${s.weight}`;

      const d = document.createElement('span');
      d.className = 'd';
      d.textContent = s.detail;

      li.append(t, w, d);
      el.signals.appendChild(li);
    }
  }

  // Action buttons reflect whether the user has already made a call.
  const marked = verdict.override !== undefined;
  el.report.hidden = marked;
  el.trust.hidden = marked;
  el.undo.hidden = !marked;
  el.undo.textContent = verdict.override === 'trusted'
    ? 'undo — stop trusting this site'
    : 'undo — stop reporting this site';
}

async function mark(verdict: 'phishing' | 'safe'): Promise<void> {
  const res = await chrome.runtime.sendMessage({
    type: 'MARK_SITE', url: currentUrl, verdict,
  } satisfies Message);
  if (res?.ok && res.verdict) render(res.verdict);

  // Reporting is also worth contributing upstream — but only if the user says so.
  if (verdict === 'phishing') {
    const submit = confirm(
      'Reported locally. Pagida will warn you about this site from now on.\n\n' +
      'Also submit it to PhishTank so other people are protected? ' +
      'This opens their site in a new tab — nothing is sent automatically.',
    );
    if (submit) {
      await chrome.tabs.create({
        url: `https://phishtank.org/add_web_phish.php?url=${encodeURIComponent(currentUrl)}`,
      });
    }
  }
}

async function init(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !tab.id) return setState('No page to check.');

  currentUrl = tab.url;
  try { currentHostname = new URL(currentUrl).hostname; } catch { currentHostname = ''; }

  if (!/^https?:/.test(currentUrl)) {
    return setState('Pagida only checks normal web pages, not browser screens.');
  }

  // Ask the worker for the verdict it already computed for this tab.
  const cached = await chrome.runtime.sendMessage({
    type: 'GET_VERDICT', tabId: tab.id,
  } satisfies Message).catch(() => null);

  if (cached?.ok && cached.verdict) return render(cached.verdict);

  // No cached verdict — the worker restarted, or the content script hasn't
  // reported yet. Fall back to an address-only check so the popup is never empty.
  setState('Checking this address…');
  const fresh = await chrome.runtime.sendMessage({
    type: 'CHECK_URL', url: currentUrl,
  } satisfies Message).catch(() => null);

  if (fresh?.ok && fresh.verdict) return render(fresh.verdict);
  setState('Could not check this page. Try reloading it.');
}

el.report.addEventListener('click', () => void mark('phishing'));
el.trust.addEventListener('click', () => void mark('safe'));
el.undo.addEventListener('click', () => void (async () => {
  await chrome.runtime.sendMessage({ type: 'UNMARK_SITE', hostname: currentHostname } satisfies Message);
  const fresh = await chrome.runtime.sendMessage({ type: 'CHECK_URL', url: currentUrl } satisfies Message);
  if (fresh?.ok && fresh.verdict) render(fresh.verdict);
})());
$('open-options').addEventListener('click', () => void chrome.runtime.openOptionsPage());

void getMarks(); // warm the storage read before the user can click
void init();
