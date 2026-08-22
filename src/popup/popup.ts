/**
 * Popup.
 *
 * Three rules this rewrite is built around, all of them from watching someone
 * actually use the old one:
 *
 *  1. It is never blank and never silent. Something meaningful is on screen
 *     within a frame, and if a verdict is still coming, Iris says she is
 *     thinking rather than showing an empty box.
 *  2. The verdict is a sentence. The number is still there for anyone who wants
 *     it, but nobody has to read a number to know what to do.
 *  3. If the page tier could not run, it says so out loud instead of quietly
 *     showing a weaker score as though it were the whole answer.
 */
import type { Verdict } from '../core/types.js';
import { adviceFor, BAND_NAME, headlineFor } from '../core/score.js';
import { Iris, expressionForBand, injectIrisCss } from '../ui/iris.js';
import type { Message } from '../shared/messages.js';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const el = {
  root: document.documentElement,
  headline: $('headline'),
  host: $('host'),
  advice: $('advice'),
  scoreBlock: $('score-block'),
  meter: $('meter'),
  bandName: $('band-name'),
  score: $('score'),
  found: $('found'),
  foundCount: $('found-count'),
  signals: $<HTMLUListElement>('signals'),
  empty: $('empty'),
  emptyText: $('empty-text'),
  acts: $('acts'),
  primary: $<HTMLButtonElement>('primary'),
  secondary: $<HTMLButtonElement>('secondary'),
  undo: $<HTMLButtonElement>('undo'),
};

injectIrisCss(document);
const iris = new Iris($('iris'), { size: 68, interactive: true });
iris.setExpression('thinking');

let currentUrl = '';
let currentHostname = '';


function render(verdict: Verdict): void {

  el.root.setAttribute('data-band', verdict.band);

  iris.setBand(verdict.band);
  iris.setExpression(
    verdict.override === 'trusted' ? 'sleepy'
      : verdict.override === 'reported' ? 'angry'
      : expressionForBand(verdict.band),
  );

  el.headline.textContent = headlineFor(verdict);
  el.host.textContent = verdict.hostname;
  el.advice.textContent = adviceFor(verdict);

  el.scoreBlock.hidden = false;
  el.meter.style.width = `${Math.max(verdict.score, 4)}%`;
  el.score.textContent = String(verdict.score);
  el.bandName.textContent = BAND_NAME[verdict.band];

  const signals = verdict.signals;
  el.signals.replaceChildren();

  if (signals.length === 0) {
    el.found.hidden = true;
    el.empty.hidden = false;
    el.emptyText.textContent = verdict.urlOnly
      ? 'I only checked the address on this one. Reload the page and I can read the page itself too.'
      : 'I checked the address, the page and my scam list. Nothing stood out.';
    el.emptyText.classList.toggle('warn', verdict.urlOnly);
  } else {
    el.empty.hidden = !verdict.urlOnly;
    if (verdict.urlOnly) {
      el.emptyText.textContent = 'I could only check the address here — reload the page for the full check.';
      el.emptyText.classList.add('warn');
    }
    el.found.hidden = false;
    el.foundCount.textContent =
      signals.length === 1 ? 'What I found' : `What I found · ${signals.length}`;

    for (const s of signals) {
      const li = document.createElement('li');
      if (s.weight < 0) li.classList.add('credit');
      if (s.tier === 'user') li.classList.add('user');

      const row = document.createElement('div');
      row.className = 'row';
      const t = document.createElement('span');
      t.className = 't';
      t.textContent = s.title;
      const w = document.createElement('span');
      w.className = 'w';
      w.textContent = s.weight === 0 ? '·' : `${s.weight > 0 ? '+' : ''}${s.weight}`;
      row.append(t, w);

      const d = document.createElement('span');
      d.className = 'd';
      d.textContent = s.detail;

      li.append(row, d);
      el.signals.appendChild(li);
    }
  }

  // Actions follow the verdict: never make "this is fine" the loud button on a
  // page that is probably stealing passwords.
  el.acts.hidden = false;
  const marked = verdict.override !== undefined;
  el.undo.hidden = !marked;
  el.primary.hidden = marked;
  el.secondary.hidden = marked;

  if (!marked) {
    if (verdict.band === 'danger' || verdict.band === 'suspicious') {
      el.primary.textContent = 'Take me back';
      el.primary.dataset.act = 'leave';
      el.secondary.textContent = 'It is fine, trust it';
      el.secondary.dataset.act = 'trust';
    } else {
      el.primary.textContent = 'Looks fine';
      el.primary.dataset.act = 'dismiss';
      el.secondary.textContent = 'Report this site';
      el.secondary.dataset.act = 'report';
    }
  }
  el.undo.textContent =
    verdict.override === 'trusted' ? 'Stop trusting this site' : 'Stop reporting this site';
}

function setThinking(text: string): void {
  el.headline.textContent = text;
  el.advice.textContent = 'One moment.';
  iris.setExpression('thinking');
}

// ---------------------------------------------------------------- actions

async function mark(verdict: 'phishing' | 'safe'): Promise<void> {
  iris.react(verdict === 'phishing' ? 'proud' : 'sad', 1800);
  const res = await chrome.runtime.sendMessage({
    type: 'MARK_SITE', url: currentUrl, verdict,
  } satisfies Message).catch(() => null);
  if (res?.ok && res.verdict) {
    setTimeout(() => render(res.verdict), 900);
  }
  if (verdict === 'phishing') {
    const share = confirm(
      'Thanks — I will warn you about this site from now on.\n\n' +
      'Send it to PhishTank as well, so other people get warned too? ' +
      'That opens their site in a new tab; nothing is sent automatically.',
    );
    if (share) {
      await chrome.tabs.create({
        url: `https://phishtank.org/add_web_phish.php?url=${encodeURIComponent(currentUrl)}`,
      });
    }
  }
}

function leave(): void {
  void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    if (tab?.id !== undefined) void chrome.tabs.goBack(tab.id).catch(() => chrome.tabs.remove(tab.id!));
  });
  window.close();
}

el.primary.addEventListener('click', () => {
  const act = el.primary.dataset.act;
  if (act === 'leave') leave();
  else window.close();
});

el.secondary.addEventListener('click', () => {
  const act = el.secondary.dataset.act;
  if (act === 'trust') void mark('safe');
  else void mark('phishing');
});

el.undo.addEventListener('click', () => void (async () => {
  iris.react('surprised', 1200);
  await chrome.runtime.sendMessage({ type: 'UNMARK_SITE', hostname: currentHostname } satisfies Message);
  const fresh = await chrome.runtime.sendMessage({ type: 'CHECK_URL', url: currentUrl } satisfies Message);
  if (fresh?.ok && fresh.verdict) render(fresh.verdict);
})());

$('report-link').addEventListener('click', () => {
  void chrome.tabs.create({ url: chrome.runtime.getURL(`report.html?u=${encodeURIComponent(currentUrl)}`) });
});
$('options-link').addEventListener('click', () => void chrome.runtime.openOptionsPage());

// ---------------------------------------------------------------- startup

async function init(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || tab.id === undefined) {
    iris.setExpression('sleepy');
    el.headline.textContent = 'Nothing to check here.';
    el.advice.textContent = 'Open a website and I will take a look.';
    return;
  }

  currentUrl = tab.url;
  try { currentHostname = new URL(currentUrl).hostname; } catch { currentHostname = ''; }

  if (!/^https?:/.test(currentUrl)) {
    iris.setExpression('sleepy');
    el.headline.textContent = 'This is a browser screen.';
    el.advice.textContent = 'I only check normal websites, so there is nothing for me to do here.';
    return;
  }

  setThinking('Checking this page…');

  const cached = await chrome.runtime.sendMessage({
    type: 'GET_VERDICT', tabId: tab.id,
  } satisfies Message).catch(() => null);
  if (cached?.ok && cached.verdict) return render(cached.verdict);

  // No verdict yet — the worker may have been evicted, or the extension
  // reloaded while this page stayed open. Ask the tab to report again before
  // falling back to a weaker address-only check.
  const rescanned = await chrome.tabs.sendMessage(tab.id, { type: 'RESCAN' } satisfies Message)
    .then(() => true).catch(() => false);

  if (rescanned) {
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise((r) => setTimeout(r, 150));
      const retry = await chrome.runtime.sendMessage({
        type: 'GET_VERDICT', tabId: tab.id,
      } satisfies Message).catch(() => null);
      if (retry?.ok && retry.verdict) return render(retry.verdict);
    }
  }

  const fresh = await chrome.runtime.sendMessage({
    type: 'CHECK_URL', url: currentUrl,
  } satisfies Message).catch(() => null);

  if (fresh?.ok && fresh.verdict) return render(fresh.verdict);

  iris.setExpression('sad');
  el.headline.textContent = 'I could not check this one.';
  el.advice.textContent = 'Try reloading the page. If it keeps happening, let me know on GitHub.';
}

void init();

export {};
