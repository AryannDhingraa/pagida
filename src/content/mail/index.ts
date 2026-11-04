/**
 * Webmail content script: checks each email as it is opened in Gmail or
 * Outlook on the web.
 *
 * The words of the email stay in this tab. The trained text model runs here,
 * and the service worker receives the facts the rules need (sender, subject,
 * links, attachment names, image addresses for QR decoding) plus one number
 * from the model. Nothing is stored, and nothing leaves the computer.
 */
import { readOpenMessages, type OpenMessage } from './adapters.js';
import { guardLinks, showBanner, showChecked } from './banner.js';
import { score } from '../../learned/textModel.js';
import { EMAIL_MODEL } from '../../learned/data/emailModel.js';
import { unwrapLink } from '../../email/links.js';
import type { Message } from '../../shared/messages.js';
import type { EmailVerdict } from '../../email/types.js';

/** Messages already checked, by a fingerprint of what was read. */
const checked = new WeakMap<HTMLElement, string>();

function fingerprint(m: OpenMessage): string {
  const e = m.evidence;
  return [e.fromAddress, e.subject, e.bodyText.length, e.links.length, e.attachments.join('|')].join('~');
}

async function check(m: OpenMessage): Promise<void> {
  const key = fingerprint(m);
  if (checked.get(m.anchor) === key) return;
  checked.set(m.anchor, key);
  if (!m.evidence.fromAddress && m.evidence.links.length === 0 && m.evidence.attachments.length === 0) return;

  const e = m.evidence;
  const textModelScore = score(EMAIL_MODEL, `${e.subject}\n\n${e.bodyText}`);
  try {
    const res = await chrome.runtime.sendMessage({
      type: 'EMAIL_SIGNALS', email: { ...e, textModelScore }, imageUrls: m.imageUrls,
    } satisfies Message) as { ok: boolean; verdict?: EmailVerdict } | undefined;
    if (!res?.ok || !res.verdict) {
      // eslint-disable-next-line no-console -- the one way to tell "off" from "broken" when debugging
      if (res && !res.ok) console.info('[Pagida] email checking is off in Pagida settings');
      return;
    }
    const v = res.verdict;
    // Band and reason ids only: never the email's content, even in the console.
    // eslint-disable-next-line no-console -- band and reason ids only, never content
    console.info(`[Pagida] email checked: ${v.band}${v.conclusions.length ? ` (${v.conclusions.map((c) => c.id).join(', ')})` : ''}`);
    if (v.conclusions.length > 0) showBanner(m.anchor, v);
    else showChecked(m.anchor, v);
    guardLinks(m.body, res.verdict.riskyLinks, unwrapLink);
  } catch {
    // Extension reloading, or the worker asleep: the next mutation retries.
    checked.delete(m.anchor);
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
function scan(): void {
  timer = undefined;
  for (const m of readOpenMessages()) void check(m);
}
function schedule(): void {
  if (timer === undefined) timer = setTimeout(scan, 700);
}

// Webmail is a single-page app: messages open, close and lazy-load without a
// navigation, so watch for changes and re-read at most once every 700 ms.
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
schedule();
// eslint-disable-next-line no-console -- confirms the script loaded on this webmail
console.info(`[Pagida] email checking ready on ${location.hostname}`);
