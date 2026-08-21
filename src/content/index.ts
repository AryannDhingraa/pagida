/**
 * Content script entry point.
 *
 * Extracts page signals once the page settles, hands them to the service worker,
 * and renders the warning bar if the worker asks for one. It re-checks on
 * single-page-app navigations, because a phishing kit that swaps in a login
 * screen without a page load would otherwise be scored on the wrong content.
 */
import { extractDomEvidence } from './extract.js';
import { hideBanner, showBanner } from './banner.js';
import type { Message } from '../shared/messages.js';

let lastUrl = location.href;
let scheduled = false;

function report(): void {
  scheduled = false;
  try {
    const dom = extractDomEvidence();
    void chrome.runtime.sendMessage({ type: 'PAGE_SIGNALS', url: location.href, dom } satisfies Message);
  } catch {
    // The worker may be asleep or the extension reloading. Nothing to do.
  }
}

function schedule(delay = 400): void {
  if (scheduled) return;
  scheduled = true;
  setTimeout(report, delay);
}

// Initial pass once the page has had a moment to render.
if (document.readyState === 'complete') schedule(150);
else window.addEventListener('load', () => schedule(150), { once: true });

// Catch SPA navigations and late-injected login forms.
const observer = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    hideBanner();
    schedule(500);
    return;
  }
  if (document.querySelector('input[type="password"]')) schedule(800);
});
if (document.documentElement) {
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

chrome.runtime.onMessage.addListener((msg: Message) => {
  if (msg.type === 'SHOW_BANNER') {
    showBanner(msg.verdict, () => {
      void chrome.runtime.sendMessage({
        type: 'MARK_SITE', url: location.href, verdict: 'safe',
      } satisfies Message);
    });
  } else if (msg.type === 'HIDE_BANNER') {
    hideBanner();
  }
});
