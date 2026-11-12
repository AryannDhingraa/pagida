/**
 * Word lists and patterns for the email engine. Plain data and small pure
 * functions, kept apart from the rules so they are easy to review and extend.
 */
import type { Band } from '../core/types.js';
import { parseHost } from '../core/util/domain.js';
import { FREE_HOSTING_SUFFIXES } from '../core/util/entropy.js';

/** Free personal mailboxes. A brand never sends its customer email from these. */
export const FREE_MAIL: ReadonlySet<string> = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'yahoo.com.au',
  'ymail.com', 'aol.com', 'icloud.com', 'me.com', 'mac.com', 'proton.me', 'protonmail.com', 'gmx.com', 'gmx.net',
  'mail.com', 'zoho.com', 'yandex.com', 'yandex.ru', 'mail.ru', 'bigpond.com', 'optusnet.com.au', 'qq.com', '163.com',
  'hotmail.co.uk', 'outlook.com.au', 'live.com.au', 'tutanota.com', 'tuta.io', 'web.de',
]);

/**
 * Click-tracking services that newsletters wrap every link in. A link whose
 * text says paypal.com but goes through one of these is normal marketing, not
 * a disguise, so the disguised-link rule cannot judge it.
 */
export const TRACKING_DOMAINS: ReadonlySet<string> = new Set([
  'sendgrid.net', 'list-manage.com', 'mcsv.net', 'mailchimp.com', 'mandrillapp.com', 'awstrack.me', 'hubspotlinks.com',
  'hs-sites.com', 'hubspotemail.net', 'exacttarget.com', 'sfmc-content.com', 'mailgun.org', 'rs6.net', 'constantcontact.com',
  'sparkpostmail.com', 'braze.com', 'iterable.com', 'klaviyo.com', 'klclick.com', 'klclick1.com', 'mkt.com', 'marketo.com',
  'mktoedge.com', 'cmail19.com', 'cmail20.com', 'createsend.com', 'salesforce.com', 'pardot.com', 'emltrk.com',
  'mailjet.com', 'sendinblue.com', 'brevo.com', 'r.mailjet.com', 'customer.io', 'customeriomail.com', 'postmarkapp.com',
  'safelinks.protection.outlook.com', 'urldefense.com', 'urldefense.proofpoint.com',
  'mimecast.com', 'mimecastprotect.com', 'linkprotect.cudasvc.com', 'bit.ly', 'lnkd.in', 't.co',
]);

/** Text that is itself an address: "www.paypal.com", "https://commbank.com.au/login". */
export function linkTextHost(text: string): string | null {
  const t = text.trim().toLowerCase();
  if (t.length > 120 || /\s/.test(t)) return null;
  const m = t.match(/^(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:[/:?#]|$)/);
  return m ? m[1]! : null;
}

export interface AttachmentRisk { weight: number; title: string; detail: string; floor?: Band }

/** How dangerous an attachment's file type is in a personal inbox. */
export function attachmentRisk(name: string): AttachmentRisk | null {
  const ext = (name.toLowerCase().match(/\.([a-z0-9]{1,5})$/) ?? [])[1];
  if (!ext) return null;
  if (['htm', 'html', 'shtml', 'xhtml', 'svg', 'mht', 'mhtml'].includes(ext)) {
    return { weight: 40, floor: 'danger', title: 'The attachment is a web page, not a document',
      detail: `${name} opens in your browser. Attached web pages are almost always a fake sign-in page that sends your password to the attacker.` };
  }
  if (['exe', 'scr', 'js', 'jse', 'vbs', 'vbe', 'wsf', 'hta', 'bat', 'cmd', 'ps1', 'msi', 'lnk', 'iso', 'img', 'vhd', 'vhdx', 'one', 'jar', 'apk', 'dmg', 'pif', 'cpl', 'reg'].includes(ext)) {
    return { weight: 45, floor: 'danger', title: 'The attachment is a program',
      detail: `${name} can run code on your computer. Real invoices, statements and documents are never sent this way.` };
  }
  if (['docm', 'xlsm', 'pptm', 'xlam', 'dotm'].includes(ext)) {
    return { weight: 25, floor: 'suspicious', title: 'The attachment contains macros',
      detail: `${name} is an Office file that can run macros. Do not click "Enable content" if it asks.` };
  }
  if (['zip', 'rar', '7z', 'gz', 'tgz', 'cab', 'ace'].includes(ext)) {
    return { weight: 10, title: 'Compressed attachment', detail: `${name} is an archive. Archives are used to hide what is inside from email filters.` };
  }
  return null;
}

const PAYMENT = /(?:(?:updated?|changed?|new)\s+(?:bank(?:ing)?|account|payment|remittance|wire)\s+(?:details|information|info|account)|change\s+of\s+bank|(?:buy|purchase|get)\s+(?:some\s+)?(?:apple|google\s+play|itunes|steam|amazon|ebay)?\s*gift\s*cards?|wire\s+(?:the\s+)?(?:funds|payment|transfer)|outstanding\s+invoice[^.]{0,60}(?:today|immediately|urgent))/i;
const VERIFY = /(?:account|access|mailbox|card|payment)[^.]{0,40}(?:will\s+be|has\s+been|is)\s+(?:suspended|locked|closed|disabled|restricted|deactivated|terminated|on\s+hold)|(?:verify|confirm|validate|update|re.?activate|unlock)(?:ing)?\s+(?:your\s+)?(?:account|identity|information|details|password|payment|mailbox|email)|unusual\s+(?:sign.?in|login|activity)|password\s+(?:expires|will\s+expire|has\s+expired|is\s+expiring)|keep\s+(?:your\s+)?(?:current|same)\s+password/i;

export function asksForPayment(text: string): boolean { return PAYMENT.test(text); }
export function asksToVerify(text: string): boolean { return VERIFY.test(text); }

export { unwrapLink } from './links.js';

/**
 * The "your mailbox" lure: storage full, password expiring, messages held,
 * account about to be closed. The most common phishing email by far, because
 * every email user has a mailbox and few know who runs it.
 */
const MAILBOX = new RegExp([
  String.raw`\bmail\s?box(?:es)?\b`, String.raw`\bweb\s?mail\b`,
  String.raw`\be-?mail\s+(?:account|storage|quota|server|expir\w*|deactivat\w*|upgrade|verification|validation|update|administrator|admin|support|team|hosting|security)\b`,
  String.raw`\b(?:storage|quota|mailbox)\s+(?:is\s+)?(?:almost\s+|nearly\s+)?(?:full|exceeded|limit|reached)`,
  String.raw`\bincoming\s+(?:e-?mails?|messages?|mails?)\b`,
  String.raw`\b(?:messages?|e-?mails?|mails?)\s+(?:(?:are|is|has|have\s+been)\s+)?(?:on\s+hold|pending|blocked|held|suspended|undelivered|quarantined|failed\s+to\s+deliver)`,
  String.raw`\b(?:pending|held|undelivered|quarantined)\s+(?:messages?|e-?mails?|mails?)\b`,
  String.raw`\bpassword\s+(?:expir\w*|renewal|is\s+set\s+to\s+expire|will\s+expire)`,
  String.raw`\b(?:cpanel|roundcube|zimbra|imap|pop3|owa)\b`, String.raw`\boutlook\s+web\s+(?:app|access)\b`,
  String.raw`\baccount\s+(?:termination|deactivation|suspension)\b`,
].join('|'), 'i');

export function talksAboutMailbox(text: string): boolean { return MAILBOX.test(text); }

/** IPFS gateways and object stores: a page anyone can upload, with no site behind it. */
const STORAGE_HOST = /(?:^|\.)(?:ipfs\.[a-z0-9.-]+|[a-z0-9-]*ipfs[a-z0-9-]*\.[a-z]{2,}|s3[.-][a-z0-9.-]*amazonaws\.com|[a-z0-9-]+\.s3\.amazonaws\.com|storage\.googleapis\.com|firebasestorage\.googleapis\.com|[a-z0-9.-]*backblazeb2\.com|[a-z0-9.-]*blob\.core\.windows\.net|[a-z0-9.-]*digitaloceanspaces\.com|[a-z0-9.-]*wasabisys\.com|[a-z0-9.-]*oortstorage\.com|[a-z0-9.-]*cloudflare-ipfs\.com|dweb\.link)$/;
const EXTRA_FREE_HOSTS = new Set(['replit.app', 'amplifyapp.com', 'glitch.me', 'ipfs.io', 'r2.dev', 'workers.dev', 'webflow.io', 'framer.app', 'firebaseapp.com', 'web.app', 'blogspot.com', 'sites.google.com', 'square.site', 'wixsite.com', 'weebly.com', 'yolasite.com', 'jimdosite.com', 'mystrikingly.com', 'tiiny.site', 'hostingersite.com', 'formstack.com', 'jotform.com', 'typeform.com', 'zohopublic.com', 'forms.office.com', 'forms.gle']);

/**
 * When a link opens a page on a platform anyone can publish to for free in a
 * minute (an IPFS gateway, a storage bucket, a free site builder), the
 * platform's name; otherwise null.
 */
export function anonymousHost(hostname: string): string | null {
  const h = hostname.toLowerCase();
  if (STORAGE_HOST.test(h)) return h.includes('ipfs') ? 'IPFS' : 'a public storage bucket';
  const { suffix, registrableDomain } = parseHost(h);
  for (const k of [suffix, registrableDomain, h]) {
    if (k && (FREE_HOSTING_SUFFIXES.has(k) || EXTRA_FREE_HOSTS.has(k))) return k;
  }
  return null;
}

/**
 * Callback phishing: a fake receipt or renewal ("Norton, $399.99, call us
 * within 24 hours to cancel") whose payload is a phone number, not a link.
 * Needs all three: a phone number, money, and the "it was not you" hook.
 */
const PHONE = /(?:\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}\b|\+\d{1,3}[\s.-]\d{2,4}[\s.-]\d{3,4}[\s.-]\d{3,4}/;
const MONEY = /[$€£]\s?\d{1,3}(?:[,.]\d{3})*(?:[.,]\d{2})?|\b\d+(?:[.,]\d{2})\s?(?:usd|eur|gbp|aud)\b|\b(?:usd|eur|gbp|aud)\s?\d/i;
const NOT_YOU = /\b(?:did\s*n[o']?t|do\s+not|didn['’]t|never)\s+(?:make|authori[sz]e|recogni[sz]e|place|request|order|initiate|purchase)|\bnot\s+(?:you|authori[sz]ed|recogni[sz]ed)\b|\bunauthori[sz]ed\b|\bcancel\w*\s+(?:this|the|your)\s+(?:order|transaction|payment|charge|purchase|renewal|plan|membership)\b|\bto\s+cancel\b(?![^.\n]{0,40}newsletter)|\brefund\b|\bdispute\b|\bauto.?renew/i;
const CALL = /\b(?:call|contact|reach|dial|phone|ring)\b[^.\n]{0,80}\d{3}|\b(?:helpline|help\s+line|toll.?free|support\s+(?:number|line|desk)|customer\s+(?:care|service)\s+(?:number|line))\b/i;

/**
 * Services that send a message a stranger wrote, from their own real address:
 * a PayPal invoice or money request, a DocuSign envelope, a QuickBooks or Xero
 * invoice. The sender checks pass because the service really sent it, and the
 * scam sits in the note. Registrable domain → the name people know.
 */
export const RELAY_SENDERS: ReadonlyMap<string, string> = new Map([
  ['paypal.com', 'PayPal'], ['paypal.com.au', 'PayPal'], ['paypal.co.uk', 'PayPal'],
  ['docusign.net', 'DocuSign'], ['docusign.com', 'DocuSign'],
  ['intuit.com', 'QuickBooks'], ['squareup.com', 'Square'], ['xero.com', 'Xero'],
  ['freshbooks.com', 'FreshBooks'], ['waveapps.com', 'Wave'], ['stripe.com', 'Stripe'],
]);

export function asksToCall(text: string): boolean {
  return PHONE.test(text) && MONEY.test(text) && NOT_YOU.test(text) && CALL.test(text);
}

/** "Pat shared a document with you", "Review and sign", "New file shared". */
const SHARE = /\b(?:shared?\s+(?:a\s+|the\s+|an?\s+)?(?:document|file|folder|pdf|item)s?|(?:document|file|folder|pdf)s?\s+(?:has\s+been\s+|was\s+|were\s+)?shared|review\s+and\s+sign|(?:e-?sign(?:ature)?|signature)\s+(?:required|requested|needed|pending)|(?:view|open|access|download)\s+(?:the\s+)?(?:document|file|attachment|pdf)s?|completed:?\s+(?:document|please\s+docusign)|invited\s+(?:you\s+)?to\s+(?:review|sign|view|edit))/i;

export function sharesDocument(text: string): boolean { return SHARE.test(text); }

/** Payment, order and transfer notices: the bait of fake receipts. */
const TRANSACTION = /\b(?:payment|transaction|order|purchase|transfer|invoice|refund|deposit|statement|remittance|settlement|wire|ach)\b[^.\n]{0,30}\b(?:confirm\w*|complete\w*|processed|received|alert|summary|notification|notice|approved|successful\w*|ready|available|pending|details)\b/i;

export function transactionNotice(text: string): boolean { return TRANSACTION.test(text); }
