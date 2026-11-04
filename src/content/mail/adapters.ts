/**
 * Reading an open email off Gmail and Outlook on the web.
 *
 * Each adapter finds the open messages on screen and reads the same small set
 * of facts from each: sender name and address, subject, body text, links,
 * attachment names and the larger images (for QR codes). Selectors are the
 * long-lived ones these clients have used for years, each with a fallback,
 * because webmail markup changes and a missed read must fail quietly rather
 * than break the inbox.
 */
import type { EmailEvidence, EmailLink } from '../../email/types.js';
import { unwrapLink } from '../../email/links.js';

export interface OpenMessage {
  /** The element the warning is placed above. */
  anchor: HTMLElement;
  /** The element whose links are guarded. */
  body: HTMLElement;
  evidence: Omit<EmailEvidence, 'textModelScore' | 'qrUrls'>;
  /** Images big enough to hold a QR code. */
  imageUrls: string[];
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

function links(body: HTMLElement): EmailLink[] {
  return Array.from(body.querySelectorAll<HTMLAnchorElement>('a[href]'))
    .filter((a) => /^https?:/i.test(a.href))
    .slice(0, 60)
    .map((a) => ({ href: unwrapLink(a.href), text: (a.textContent ?? '').trim().slice(0, 200) }));
}

/**
 * Images big enough to hold a QR code, and only ones the webmail has already
 * loaded: when Outlook blocks a sender's images, Pagida must not fetch them
 * behind its back and tell the sender the email was opened.
 */
function images(body: HTMLElement): string[] {
  return Array.from(body.querySelectorAll<HTMLImageElement>('img[src]'))
    .filter((i) => i.complete && i.naturalWidth >= 80 && i.naturalHeight >= 80)
    .map((i) => i.src)
    .filter((s) => /^(https?:|data:image)/.test(s))
    .slice(0, 3);
}

function text(el: Element | null | undefined): string {
  return ((el as HTMLElement | null)?.innerText ?? el?.textContent ?? '').trim();
}

// ------------------------------------------------------------------ Gmail

export function readGmail(): OpenMessage[] {
  const out: OpenMessage[] = [];
  const subject = text(document.querySelector('h2.hP'));
  // The signed-in account is in the tab title: "Inbox (3) - jose@monkey.org - Gmail".
  const account = (document.title.match(EMAIL_RE) ?? [''])[0];
  // Each expanded message in a conversation is a div.adn with its own sender
  // and body. If Gmail ever drops that class, fall back to the message block
  // around each body (it carries data-message-id).
  let messages = Array.from(document.querySelectorAll<HTMLElement>('div.adn'));
  if (messages.length === 0) {
    messages = Array.from(document.querySelectorAll<HTMLElement>('div.a3s'))
      .map((b) => b.closest<HTMLElement>('[data-message-id], [data-legacy-message-id]'))
      .filter((m): m is HTMLElement => !!m);
  }
  for (const msg of messages) {
    const body = msg.querySelector<HTMLElement>('div.a3s');
    // The sender carries email= and name=; recipients ("to me") sit in span.g2.
    const from = msg.querySelector<HTMLElement>('span.gD[email]')
      ?? Array.from(msg.querySelectorAll<HTMLElement>('[email][name]')).find((el) => !el.classList.contains('g2') && !body?.contains(el)) ?? null;
    if (!body || !from) continue;
    const attachments = [
      ...Array.from(msg.querySelectorAll('span.aV3')).map((s) => text(s)),
      ...Array.from(msg.querySelectorAll('[download_url]')).map((s) => (s.getAttribute('download_url') ?? '').split(':')[1] ?? ''),
    ].filter(Boolean);
    out.push({
      anchor: body,
      body,
      imageUrls: images(body),
      evidence: {
        client: 'gmail',
        fromName: from.getAttribute('name') ?? text(from),
        fromAddress: from.getAttribute('email') ?? '',
        toAddress: account || (msg.querySelector('span.g2[email]')?.getAttribute('email') ?? ''),
        subject,
        bodyText: text(body).slice(0, 20_000),
        links: links(body),
        attachments: [...new Set(attachments)],
      },
    });
  }
  return out;
}

// ------------------------------------------------------------------ Outlook

export function readOutlook(): OpenMessage[] {
  const out: OpenMessage[] = [];
  const bodies = Array.from(document.querySelectorAll<HTMLElement>('div[aria-label="Message body"], div[aria-label="Message Body"]'));
  for (const body of bodies) {
    // The message's own block: header, attachments and body. Walk up until a
    // sender address is in view, but never past the reading pane.
    let root: HTMLElement | null = body.parentElement;
    let senderEl: HTMLElement | null = null;
    for (let i = 0; root && i < 8; i++, root = root.parentElement) {
      senderEl = Array.from(root.querySelectorAll<HTMLElement>('[title*="@"], [aria-label*="@"]'))
        .find((el) => !body.contains(el) && EMAIL_RE.test(el.getAttribute('title') ?? el.getAttribute('aria-label') ?? '')) ?? null;
      if (senderEl) break;
    }
    if (!root) continue;
    const label = senderEl?.getAttribute('title') ?? senderEl?.getAttribute('aria-label') ?? '';
    const address = (label.match(EMAIL_RE) ?? [''])[0];
    // "Name <name@domain>" or a persona button whose visible text is the name.
    const nameFromLabel = label.replace(/<[^>]*>/, '').replace(EMAIL_RE, '').replace(/^from:?\s*/i, '').trim();
    const fromName = nameFromLabel || text(senderEl).replace(EMAIL_RE, '').replace(/[<>]/g, '').trim();
    // The first other address in the header is the reader (To:), when shown.
    const toAddress = Array.from(root.querySelectorAll<HTMLElement>('[title*="@"], [aria-label*="@"]'))
      .filter((el) => !body.contains(el) && el !== senderEl)
      .map((el) => ((el.getAttribute('title') ?? el.getAttribute('aria-label') ?? '').match(EMAIL_RE) ?? [''])[0])
      .find((a) => a && a !== address) ?? '';
    const pane = body.closest('[role="main"]') ?? document;
    const subject = text(pane.querySelector('[role="heading"][aria-level="2"], div[role="heading"]'));
    const attachments = Array.from(root.querySelectorAll<HTMLElement>('[role="option"][title], [role="listitem"][title], [aria-label*="ttachment"] [title]'))
      .map((el) => el.getAttribute('title') ?? '')
      .filter((t) => /\.[a-z0-9]{2,5}$/i.test(t));
    out.push({
      anchor: body,
      body,
      imageUrls: images(body),
      evidence: {
        client: 'outlook',
        fromName,
        fromAddress: address,
        toAddress,
        subject,
        bodyText: text(body).slice(0, 20_000),
        links: links(body),
        attachments: [...new Set(attachments)],
      },
    });
  }
  return out;
}

export function readOpenMessages(): OpenMessage[] {
  const host = location.hostname;
  if (host === 'mail.google.com') return readGmail();
  if (/^outlook\.(?:live|office|office365)\.com$/.test(host)) return readOutlook();
  return [];
}
