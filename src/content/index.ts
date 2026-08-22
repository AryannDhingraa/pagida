/**
 * Content script entry point.
 *
 * Extracts page signals once the page settles, hands them to the service worker,
 * and renders the warning bar if the worker asks for one.
 *
 * The re-scanning here is deliberately conservative. An earlier version simply
 * re-reported whenever the DOM mutated and a password field was present, which
 * on any page with an ad carousel or a live region meant scoring the same page
 * over and over — burning CPU and firing a fresh RDAP lookup each time. It now
 * re-reports only when something the engine would actually score has changed,
 * and never more than a handful of times per page.
 */
import { extractDomEvidence } from './extract.js';
import { hideCompanion, showCompanion } from './companion.js';
import { evidenceSignature } from '../core/evidence.js';
import type { Message } from '../shared/messages.js';

/** Upper bound on reports per page load, regardless of how busy the DOM is. */
const MAX_REPORTS_PER_PAGE = 4;
const SETTLE_MS = 400;

let lastUrl = location.href;
/** Fingerprint of the last evidence we sent, so identical re-scans are dropped. */
let lastSignature = '';
let reportCount = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

function report(force = false): void {
  timer = undefined;
  if (!force && reportCount >= MAX_REPORTS_PER_PAGE) return;
  try {
    const dom = extractDomEvidence();
    const signature = evidenceSignature(location.href, dom);
    if (!force && signature === lastSignature) return;

    lastSignature = signature;
    reportCount++;
    void chrome.runtime.sendMessage({
      type: 'PAGE_SIGNALS', url: location.href, dom,
    } satisfies Message);
  } catch {
    // The worker may be asleep or the extension reloading. Nothing to do.
  }
}

function schedule(delay = SETTLE_MS, force = false): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = setTimeout(() => report(force), delay);
}

// Initial pass once the page has had a moment to render.
if (document.readyState === 'complete') schedule(150);
else window.addEventListener('load', () => schedule(150), { once: true });

/**
 * Catch two things only: a single-page-app navigation, and a credential form
 * appearing that was not there when we last looked. Everything else is noise.
 */
let sawPasswordField = false;
const observer = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    lastSignature = '';
    reportCount = 0;
    sawPasswordField = false;
    hideCompanion();
    schedule(500);
    return;
  }
  const hasPassword = document.querySelector('input[type="password"]') !== null;
  if (hasPassword && !sawPasswordField) {
    sawPasswordField = true;
    schedule(600);
  }
});
if (document.documentElement) {
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  if (msg.type === 'SHOW_COMPANION') {
    showCompanion(msg.verdict, {
      onTrust: () => void chrome.runtime.sendMessage({
        type: 'MARK_SITE', url: location.href, verdict: 'safe',
      } satisfies Message),
      onReport: () => void chrome.runtime.sendMessage({
        type: 'MARK_SITE', url: location.href, verdict: 'phishing',
      } satisfies Message),
      onExplain: () => void chrome.runtime.sendMessage({
        type: 'OPEN_REPORT', url: location.href,
      } satisfies Message),
    });
  } else if (msg.type === 'HIDE_COMPANION') {
    hideCompanion();
  } else if (msg.type === 'RESCAN') {
    // The popup asks for this when the service worker has no verdict for the
    // tab — after a worker restart, or after the extension was reloaded while
    // the page stayed open. Without it the popup silently degrades to an
    // address-only score and the page tier is never applied.
    report(true);
    sendResponse({ ok: true });
    return true;
  }
  return undefined;
});
