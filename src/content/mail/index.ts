/**
 * Webmail content script: checks each email as it is opened in Gmail or
 * Outlook on the web.
 *
 * The words of the email stay in this tab. The trained text model runs here,
 * and the service worker receives the facts the rules need (sender, subject,
 * links, attachment names, image addresses for QR decoding) plus one number
 * from the model. Nothing is stored, and nothing leaves the computer.
 */
import { readOpenMessages, readerFacts, type OpenMessage } from './adapters.js';
import { readerState, SETTLE_MS, type ReaderState } from '../../email/health.js';
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
    noteClicks(m.body, v);
    guardLinks(m.body, res.verdict.riskyLinks, unwrapLink);
  } catch {
    // Extension reloading, or the worker asleep: the next mutation retries.
    checked.delete(m.anchor);
  }
}

/**
 * When a link in a checked email is opened, the page it leads to is checked
 * knowing it came from this email (and whether the email was a warning).
 * Only the link and the verdict go to the worker, never the email.
 */
const watched = new WeakMap<HTMLElement, EmailVerdict>();
function noteClicks(body: HTMLElement, v: EmailVerdict): void {
  const fresh = !watched.has(body);
  watched.set(body, v);
  if (!fresh) return;
  const opened = (e: MouseEvent): void => {
    const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    const verdict = watched.get(body);
    if (!a || !verdict) return;
    void chrome.runtime.sendMessage({ type: 'EMAIL_LINK_OPENED', href: unwrapLink(a.href), band: verdict.band, warned: verdict.conclusions.length > 0 } satisfies Message).catch(() => undefined);
  };
  // Capture, so this runs before the link guard's confirm and before Gmail opens the tab.
  body.addEventListener('click', opened, true);
  body.addEventListener('auxclick', opened, true);
}

let timer: ReturnType<typeof setTimeout> | undefined;
function scan(): void {
  timer = undefined;
  const messages = readOpenMessages();
  for (const m of messages) void check(m);
  judge(messages.length);
}

// ---------------------------------------------------------------- health

let lastAddress = location.href;
let addressChangedAt = Date.now();
let reported: ReaderState | undefined;
let recheck: ReturnType<typeof setTimeout> | undefined;

/** Tell the worker when Pagida can, or cannot, read what is open. */
function judge(messagesRead: number): void {
  if (location.href !== lastAddress) { lastAddress = location.href; addressChangedAt = Date.now(); }
  const facts = readerFacts(messagesRead, Date.now() - addressChangedAt);
  if (!facts) return;
  const state = readerState(facts);
  // A page that has stopped changing sends no more mutations, so come back
  // once the email has had its time to load.
  if (state === 'loading' && recheck === undefined) {
    recheck = setTimeout(() => { recheck = undefined; schedule(); }, SETTLE_MS);
  }
  if (state === 'loading' || state === reported) return;
  reported = state;
  // eslint-disable-next-line no-console -- the state only, never content
  if (state === 'blind') console.warn('[Pagida] an email is open but could not be read. The mailbox layout may have changed.');
  void chrome.runtime.sendMessage({ type: 'MAIL_HEALTH', state, client: facts.client } satisfies Message).catch(() => { reported = undefined; });
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
