/**
 * The email engine: what Pagida says about one open email.
 *
 * Same discipline as the web engine. Rules add weighted signals; a warning
 * the person actually sees needs a conclusion, a reason that can be said in
 * one sentence ("this says it is from CommBank but was sent from a Gmail
 * address"). The trained text model never raises a warning on its own: it
 * only counts when the email also has the shape of a phishing email (an
 * unknown sender, and a link to somewhere that is not the sender or a site
 * Pagida knows).
 *
 * The rules, in the order below:
 *   who sent it      brand name on the wrong address, lookalike domains,
 *                    pretending to be the reader's own organisation
 *   where links go   lists, the web engine, disguised links, anonymous hosts
 *   what is attached dangerous file types, QR codes
 *   what it asks     money, bank details, "verify your mailbox"
 */
import type { Band, Conclusion, Signal } from '../core/types.js';
import { parseHost } from '../core/util/domain.js';
import { evidenceFromUrl } from '../core/evidence.js';
import { bandFor, evaluate } from '../core/score.js';
import { bandRank, higherBand } from '../core/conclusions.js';
import { BRAND_DOMAINS, domainsForToken, isWellKnown } from '../core/data/index.js';
import { wholeWordTokens } from '../core/brandText.js';
import { brandName } from '../core/identity.js';
import type { EmailEvidence, EmailVerdict, LinkFinding } from './types.js';
import {
  FREE_MAIL, TRACKING_DOMAINS, anonymousHost, asksForPayment, asksToCall, asksToVerify, attachmentRisk,
  linkTextHost, sharesDocument, talksAboutMailbox, transactionNotice,
} from './patterns.js';

const reg = (host: string): string => parseHost(host).registrableDomain;
/** Younger than this is "brand new" for a sender or link domain. */
const NEW_DOMAIN_DAYS = 30;
const days = (n: number): string => (n <= 1 ? '1 day' : `${n} days`);
const wordIn = (word: string, text: string): boolean =>
  new RegExp(`(?:^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z0-9]|$)`, 'i').test(text);
const hostOf = (href: string): string => { try { return new URL(href).hostname.toLowerCase(); } catch { return ''; } };

export function senderDomain(address: string): string {
  const at = address.lastIndexOf('@');
  return at < 0 ? '' : reg(address.slice(at + 1).toLowerCase().replace(/[>\s]/g, ''));
}

/** The URL rules that say a domain imitates a brand. */
const LOOKALIKE_IDS = new Set(['brand_typosquat', 'brand_confusable_domain', 'brand_on_foreign_tld',
  'brand_in_subdomain', 'brand_in_domain_name', 'mixed_script_hostname', 'confusable_characters']);
/** Of those, the ones an old, real domain can trip by sharing a word with a brand (slack.net). */
const WEAK_LOOKALIKE_IDS = new Set(['brand_on_foreign_tld', 'brand_in_subdomain']);

function lookalike(domain: string): Signal | undefined {
  const ev = evidenceFromUrl(`https://${domain}/`);
  if (!ev) return undefined;
  return evaluate(ev).signals.find((s) => LOOKALIKE_IDS.has(s.id));
}

/**
 * Address-only check of one link with the web engine. The worker adds the
 * blocklists. A link only counts as suspicious when the engine can name why
 * (a conclusion, or an address that imitates a brand): long tracking codes and
 * plain-http links in newsletters are not a reason to warn about an email.
 */
export function checkLink(href: string): LinkFinding {
  const ev = evidenceFromUrl(href);
  if (!ev || !/^https?:$/.test(ev.protocol)) return { href, band: 'clean', listed: false };
  const v = evaluate(ev);
  const imitates = v.signals.find((s) => LOOKALIKE_IDS.has(s.id));
  const top = v.conclusions[0] ?? imitates ?? v.signals.find((s) => s.weight > 0);
  const named = v.conclusions.length > 0 || !!imitates;
  const band: Band = !named && bandRank(v.band) > bandRank('caution') ? 'caution' : v.band;
  return { href, band, reason: top?.title, listed: false };
}

/** Words that can sit next to a brand in a sender name without making it someone else's name. */
const SENDER_FILLER = /^(?:the|your|my|team|support|security|service|services|customer|customers|care|help|helpdesk|desk|account|accounts|id|billing|payments?|alerts?|notifications?|notice|admin|administrator|online|official|no|reply|noreply|do|not|info|update|updates|center|centre|verification|member|members|rewards|prime|business|mail|email|hr|it|inc|ltd|llc|\d+)$/i;
const GENERIC_SENDER = /^(?:support|security|service|customer|account|billing|notification|admin|team|help|no.?reply|alert|info|it\b|hr\b|system|server|mail|e-?mail|web\s?mail|delivery|reminder|finance|payroll)\b/i;

/**
 * Brands the sender's name claims to be. "Lockergnome Apple Core" is a
 * newsletter about Apple, not Apple: a name claims a brand when it starts with
 * it, is the brand plus filler words ("Your PayPal Account"), or ends in
 * "via OneDrive".
 */
function nameClaims(name: string): string[] {
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const via = name.match(/\bvia\s+([a-z0-9][a-z0-9 ]{1,30})$/i);
  const out = new Set(via ? wholeWordTokens(via[1]!, true) : []);
  for (const b of wholeWordTokens(name, true)) {
    const flat = b.replace(/\s+/g, '');
    // Find the run of words that spells the brand: "american express" for americanexpress.
    let start = -1, end = -1;
    for (let i = 0; i < words.length && start < 0; i++) {
      let acc = '';
      for (let j = i; j < words.length && acc.length < flat.length; j++) {
        acc += words[j];
        if (acc === flat) { start = i; end = j; }
      }
    }
    if (start < 0) continue;
    const rest = words.filter((_, k) => k < start || k > end);
    if (start === 0 || rest.every((w) => SENDER_FILLER.test(w))) out.add(b);
  }
  return [...out];
}

/** The reader's organisation, from their own address: "monkey" for jose@monkey.org. Null for free mail. */
function readerOrg(e: EmailEvidence): { domain: string; label: string } | null {
  const domain = senderDomain(e.toAddress ?? '');
  if (!domain || FREE_MAIL.has(domain)) return null;
  const label = parseHost(domain).sld;
  return label && label.length >= 4 ? { domain, label } : null;
}

export function evaluateEmail(e: EmailEvidence, findings: LinkFinding[]): EmailVerdict {
  const domain = senderDomain(e.fromAddress);
  const free = FREE_MAIL.has(domain);
  const known = !free && (BRAND_DOMAINS.has(domain) || isWellKnown(domain));
  const signals: Signal[] = [];
  const conclusions: Conclusion[] = [];
  const add = (s: Signal): void => { signals.push(s); };
  const conclude = (c: Conclusion): void => { conclusions.push(c); };

  const text = `${e.subject}\n${e.bodyText}`;
  const head = `${e.fromName}\n${e.subject}\n${e.bodyText.slice(0, 1500)}`;
  const model = typeof e.textModelScore === 'number' ? e.textModelScore : null;
  const pushesSignIn = asksToVerify(text) && e.links.length > 0;
  const mailboxLure = talksAboutMailbox(head);
  const callback = asksToCall(text);
  const docShare = sharesDocument(head) && (e.links.length > 0 || e.attachments.length > 0);
  const payment = asksForPayment(text);
  /** The email wants something done: sign in, fix the mailbox, open a document, call, pay. */
  const wantsAction = pushesSignIn || mailboxLure || callback || docShare || payment;
  const toLocal = (e.toAddress ?? '').split('@')[0]!.toLowerCase();
  const toDomain = senderDomain(e.toAddress ?? '');
  // "[jose] Payment Completed!", "Statement ready - jose@monkey.org": mass mail made to look personal.
  const personalSubject = !!toLocal && toLocal.length >= 3 && domain !== toDomain
    && (e.subject.toLowerCase().includes((e.toAddress ?? '').toLowerCase()) || wordIn(toLocal, e.subject));

  /**
   * Not a brand, not a well-known site, not a newsletter's click tracker. The
   * sender's own domain counts as unknown too: every rule that uses this
   * already requires a sender Pagida does not know.
   */
  const offBrand = (href: string): boolean => {
    const d = reg(hostOf(href));
    return !!d && !BRAND_DOMAINS.has(d) && !isWellKnown(d) && !TRACKING_DOMAINS.has(d);
  };
  const offBrandLinks = e.links.filter((l) => offBrand(l.href));

  // ================================================================ who sent it

  const real = (b: string): boolean => domainsForToken(b).length > 0;
  const isNot = (b: string): boolean => !domainsForToken(b).includes(domain);
  const named = nameClaims(e.fromName).filter(real);
  // A generic sender name ("Support", "IT Delivery Notice") borrows its brand from the subject.
  // A reply ("Re: Microsoft newsletter tagged as spam") is a conversation about a brand, not from one.
  const subjectBrands = /^\s*(?:re|fwd?|aw|wg|sv|antw)\s*(?:\[\d+\])?:/i.test(e.subject) ? [] : wholeWordTokens(e.subject, false).filter(real);
  const generic = e.fromName.trim() === '' || (named.length === 0 && GENERIC_SENDER.test(e.fromName.trim()));
  const brands = named.length > 0 ? named : generic ? subjectBrands : [];
  // Or a brand in the subject of an email that wants something done and is not from that brand.
  const subjectImpostor = !known && wantsAction && (offBrandLinks.length > 0 || callback || e.attachments.length > 0)
    ? subjectBrands.find(isNot) : undefined;
  const impostor = brands.find(isNot) ?? subjectImpostor;
  const lookSig = domain && !known ? lookalike(domain) : undefined;
  const look = lookSig && (!WEAK_LOOKALIKE_IDS.has(lookSig.id) || brands.length > 0) ? lookSig : undefined;

  if (look) {
    add({ id: 'sender_lookalike_domain', title: `Sent from a lookalike address: ${domain}`,
      detail: look.detail, tier: 'url', weight: 35 });
    conclude({ id: 'lookalike_sender', title: `This email comes from a fake ${domain.split('.')[0]} address`,
      detail: `It was sent from ${domain}. ${look.detail}`, floor: 'danger', because: ['sender_lookalike_domain'] });
  }

  if (impostor && domain) {
    const b = brandName(impostor);
    const realDomains = domainsForToken(impostor).slice(0, 2).join(' or ');
    const where = named.includes(impostor) ? 'name' : 'subject';
    add({ id: 'sender_brand_mismatch', title: `Says it is from ${b}, sent from ${domain}`,
      detail: `The sender's ${where} says ${b}, but the address is ${e.fromAddress}. ${b} sends from ${realDomains}.`,
      tier: 'dom', weight: free ? 40 : 28 });
    if (free || look || !known) {
      conclude({
        id: 'impersonated_sender',
        title: free ? `This is not ${b}: it was sent from a ${domain} address` : `This email pretends to be from ${b}`,
        detail: `The ${where} says ${b} but the address is ${e.fromAddress}. ${b}'s real emails come from ${realDomains}.`,
        // A brand name on an unknown domain that also wants you to sign in or
        // open a document through a link that is not the brand: the whole kit.
        floor: free || look || ((pushesSignIn || docShare || mailboxLure) && offBrandLinks.length > 0) ? 'danger' : 'suspicious',
        because: ['sender_brand_mismatch'],
      });
    }
  }

  // "monkey.org IT Support" writing to jose@monkey.org from some other domain.
  const org = readerOrg(e);
  const orgNamed = !!org && domain !== org.domain && !known && (
    // In the sender's name: "monkey.org Helpdesk".
    wordIn(org.label, e.fromName)
    // Or the reader's own address or domain in a subject about their account:
    // "Password expiry for jose@monkey.org". Colleagues discussing "monkey.org"
    // in a subject line do not also say the mailbox is full.
    || ((mailboxLure || pushesSignIn) && e.subject.toLowerCase().includes(org.domain)));
  if (org && orgNamed) {
    add({ id: 'sender_claims_reader_org', title: `Uses your organisation's name (${org.domain}) but was sent from ${domain || 'elsewhere'}`,
      detail: `Messages from your own IT team or email provider come from ${org.domain}, not from ${domain || 'an outside address'}.`,
      tier: 'dom', weight: 30 });
    if (offBrandLinks.length > 0 || e.attachments.length > 0 || mailboxLure) {
      conclude({ id: 'fake_internal_sender', title: `This is not from ${org.domain}`,
        detail: `It uses your organisation's name, but it was sent from ${domain || 'an outside address'}. Your own IT team would write from ${org.domain}.`,
        floor: 'danger', because: ['sender_claims_reader_org'] });
    }
  }

  if (known && !impostor && !look) {
    add({ id: 'sender_known_domain', title: `Sent from ${domain}`,
      detail: `${domain} is a well-known domain. That alone does not make an email safe, but it is not a disguised sender.`,
      tier: 'dom', weight: -10 });
  }

  // ================================================================ where links go

  const listed = findings.find((f) => f.listed);
  if (listed) {
    const host = reg(hostOf(listed.href));
    add({ id: 'email_link_listed', title: 'Links to a known phishing site',
      detail: `${host} is on a list of phishing sites.`, tier: 'reputation', weight: 60, certainty: 'correlated' });
    conclude({ id: 'listed_link', title: 'A link in this email goes to a known phishing site',
      detail: `${host} is on a public list of active phishing sites. Do not click it.`, floor: 'danger', because: ['email_link_listed'] });
  }

  const flagged = findings.find((f) => !f.listed && bandRank(f.band) >= bandRank('suspicious'));
  if (flagged) {
    const host = reg(hostOf(flagged.href));
    const detail = flagged.reason ? `${host}: ${flagged.reason}.` : `Pagida's checks flag ${host}.`;
    add({ id: 'email_link_suspicious', title: `Links to a suspicious site: ${host}`, detail, tier: 'url',
      weight: flagged.band === 'danger' ? 35 : 22 });
    conclude({ id: 'suspicious_link', title: `A link in this email goes somewhere suspicious (${host})`, detail,
      floor: flagged.band === 'danger' ? 'danger' : 'suspicious', because: ['email_link_suspicious'] });
  }

  // Link text that names one site but goes to another.
  const disguised: LinkFinding[] = [];
  for (const l of e.links) {
    const shown = linkTextHost(l.text);
    const actual = reg(hostOf(l.href));
    if (!shown || !actual) continue;
    const shownReg = reg(shown);
    // Same site, a click tracker, the sender's own redirect, or a brand to its sister domain.
    if (shownReg === actual || TRACKING_DOMAINS.has(actual) || actual === domain) continue;
    if (BRAND_DOMAINS.has(shownReg) && BRAND_DOMAINS.has(actual)) continue;
    const shownIsBrand = BRAND_DOMAINS.has(shownReg);
    add({ id: 'disguised_link', title: `A link shows ${shownReg} but goes to ${actual}`,
      detail: `The text of a link says ${l.text.trim().slice(0, 60)}, but clicking it opens ${actual}.`, tier: 'url', weight: shownIsBrand ? 35 : 18 });
    if (shownIsBrand) {
      disguised.push({ href: l.href, band: 'danger', listed: false, reason: `It shows ${shownReg} but opens ${actual}` });
      conclude({ id: 'disguised_link', title: `A link pretends to go to ${shownReg}`,
        detail: `It shows ${shownReg}, but it really opens ${actual}. That is how a fake sign-in page is reached.`,
        floor: 'danger', because: ['disguised_link'] });
    }
    break;
  }

  // A page on IPFS, a storage bucket or a free site builder, linked from an email.
  const anon = e.links.map((l) => ({ l, platform: anonymousHost(hostOf(l.href)) }))
    .find((x) => x.platform && reg(hostOf(x.l.href)) !== domain);
  if (anon) {
    const host = hostOf(anon.l.href);
    add({ id: 'link_to_anonymous_host', title: `A link opens a page on ${anon.platform}`,
      detail: `${host} is on ${anon.platform}, where anyone can put up a page in a minute without saying who they are.`,
      tier: 'url', weight: 15 });
    if (pushesSignIn || mailboxLure || (model !== null && model >= 0.9)) {
      conclude({ id: 'anonymous_host_link', title: 'The link opens a page that anyone could have made',
        detail: `It goes to ${host}, a page on ${anon.platform}. Real companies do not send you to pages like this to sign in or check your account.`,
        floor: 'danger', because: ['link_to_anonymous_host'] });
    }
  }

  // Brand-new domains, when the worker could ask the registry (online only).
  const ages = e.domainAges ?? {};
  const young = (d: string): number | null => { const a = ages[d]; return typeof a === 'number' && a < NEW_DOMAIN_DAYS ? a : null; };
  const senderAge = domain && !known && !free ? young(domain) : null;
  if (senderAge !== null) {
    add({ id: 'sender_domain_new', title: `The sender's domain is ${days(senderAge)} old`,
      detail: `${domain} was registered ${days(senderAge)} ago. Scammers register a fresh domain for each campaign; real companies have used theirs for years.`,
      tier: 'reputation', weight: 25 });
    if (impostor || wantsAction) {
      conclude({ id: 'new_sender_domain', title: `This was sent from a domain registered ${days(senderAge)} ago`,
        detail: `${domain} is brand new, and the email ${impostor ? `uses the name ${brandName(impostor)}` : 'wants you to act on it'}. That combination is almost never a real company.`,
        floor: impostor || pushesSignIn || mailboxLure ? 'danger' : 'suspicious', because: ['sender_domain_new'] });
    }
  }
  const youngLink = offBrandLinks.map((l) => reg(hostOf(l.href))).find((d) => d !== domain && young(d) !== null);
  if (youngLink) {
    const a = young(youngLink)!;
    add({ id: 'link_domain_new', title: `A link goes to a domain registered ${days(a)} ago`,
      detail: `${youngLink} is ${days(a)} old. Phishing pages live on domains bought days before the email goes out.`, tier: 'reputation', weight: 22 });
    if (wantsAction) {
      conclude({ id: 'new_link_domain', title: `The link goes to a site that is ${days(a)} old`,
        detail: `It opens ${youngLink}, registered ${days(a)} ago, and the email wants you to act through it. Go to the company's site yourself instead.`,
        floor: 'danger', because: ['link_domain_new'] });
    }
  }

  // ================================================================ attachments and QR codes

  for (const name of e.attachments) {
    const risk = attachmentRisk(name);
    if (!risk) continue;
    add({ id: 'risky_attachment', title: `Attachment ${name}`, detail: risk.detail, tier: 'dom', weight: risk.weight });
    if (risk.floor) conclude({ id: 'dangerous_attachment', title: risk.title, detail: risk.detail, floor: risk.floor, because: ['risky_attachment'] });
    break;
  }

  const qr = e.qrUrls?.[0];
  if (qr) {
    const finding = findings.find((f) => f.href === qr);
    const host = reg(hostOf(qr)) || qr;
    add({ id: 'qr_code', title: `Contains a QR code that opens ${host}`,
      detail: 'QR codes in emails are used to move you to your phone, where the address is harder to check.', tier: 'url', weight: 10 });
    if (finding && (finding.listed || bandRank(finding.band) >= bandRank('suspicious'))) {
      conclude({ id: 'qr_to_bad_page', title: 'The QR code in this email leads to a suspicious page',
        detail: `It opens ${host}. ${finding.reason ?? ''}`.trim(), floor: 'danger', because: ['qr_code'] });
    } else if (offBrand(qr) && (asksToVerify(text) || mailboxLure || /\bscan\b[^.]{0,40}\b(?:qr|code)\b/i.test(text) || impostor)) {
      // Quishing: "scan to verify" to a site that is neither the sender nor a known one.
      conclude({ id: 'qr_to_bad_page', title: 'This email wants you to scan a QR code to sign in',
        detail: `The code opens ${host}, which is not a site Pagida knows. Real companies do not ask you to verify an account by scanning a code in an email.`,
        floor: impostor ? 'danger' : 'suspicious', because: ['qr_code'] });
    }
  }

  // ================================================================ what it asks you to do

  if (payment && !known) {
    add({ id: 'payment_request', title: 'Asks you to pay or change bank details',
      detail: 'Requests to pay a new account, update bank details or buy gift cards are the core of invoice and boss scams.', tier: 'dom', weight: 20 });
    conclude({ id: 'payment_scam', title: 'This email asks you to send money or change bank details',
      detail: 'Check by calling the person or company on a number you already have, not one in this email.', floor: 'suspicious', because: ['payment_request'] });
  }
  if (pushesSignIn) {
    add({ id: 'verify_pressure', title: 'Pressure to sign in or verify',
      detail: 'It says your account will be closed, locked or suspended unless you act through a link.', tier: 'dom', weight: 12 });
  }
  if (mailboxLure && !known) {
    add({ id: 'mailbox_lure', title: 'About your mailbox, from someone who does not run it',
      detail: `Storage full, password expiring, messages on hold: the most common phishing email there is. It came from ${domain || 'an unknown address'}, which is not your email provider.`,
      tier: 'dom', weight: 14 });
    const corroborated = orgNamed || !!anon || (model !== null && model >= 0.9) || pushesSignIn;
    if (offBrandLinks.length > 0 && corroborated) {
      conclude({ id: 'fake_mailbox_notice', title: 'This is a fake message about your email account',
        detail: `It says something is wrong with your mailbox, but it was sent from ${domain || 'an unknown address'} and its link goes to ${reg(hostOf(offBrandLinks[0]!.href))}. Your real email provider never sends you to another site to fix your account.`,
        floor: 'danger', because: ['mailbox_lure'] });
    }
  }

  if (callback) {
    add({ id: 'callback_lure', title: 'Wants you to phone about a charge',
      detail: 'It names an amount, says to call if it was not you, and gives a number. Fake receipts work this way: the person who answers asks for remote access to your computer or your card.',
      tier: 'dom', weight: 18 });
    if (!known || impostor) {
      conclude({ id: 'callback_scam', title: 'This email wants you to call a number about a charge',
        detail: 'Do not call the number in this email. If you are worried about a charge, check your account on the official site or app, or call the number on the back of your card.',
        floor: impostor ? 'danger' : 'suspicious', because: ['callback_lure'] });
    }
  }
  if (docShare && !known && offBrandLinks.length > 0) {
    add({ id: 'document_lure', title: 'A shared document, from someone Pagida does not know',
      detail: `Shared-document emails are the most common way into a fake Microsoft or Google sign-in page. This one came from ${domain || 'an unknown address'}.`,
      tier: 'dom', weight: 14 });
  }

  // ================================================================ the trained text model

  if (model !== null) {
    if (model >= 0.9) {
      add({ id: 'email_text_model', title: 'Reads like a phishing email',
        detail: `Pagida's trained model, which has read thousands of real phishing and legitimate emails, puts this one at ${Math.round(model * 100)}%. It adjusts the score; it never decides on its own.`,
        tier: 'dom', weight: 12 });
    } else if (model <= 0.1) {
      add({ id: 'email_text_model', title: 'Reads like an ordinary email',
        detail: `Pagida's trained model puts this one at ${Math.round(model * 100)}% phishing.`, tier: 'dom', weight: -6 });
    }
    // The model plus the shape: an unknown sender, wording the model is sure
    // about, a reason to click, and a link that leaves for somewhere unknown.
    const bait = wantsAction || transactionNotice(text) || personalSubject;
    const payload = offBrandLinks.length > 0 || e.attachments.length > 0;
    if (model >= 0.97 && !known && bait && payload && conclusions.length === 0) {
      const via = offBrandLinks[0] ? `a link to ${reg(hostOf(offBrandLinks[0].href))}` : `the attachment ${e.attachments[0]}`;
      conclude({ id: 'phishing_wording', title: 'This reads like a phishing email',
        detail: `It is from ${domain || 'an unknown sender'}, it pushes you to act through ${via}, and Pagida's trained model rates the wording ${Math.round(model * 100)}% phishing. Do not use it; go to the company's site yourself.`,
        floor: 'suspicious', because: ['email_text_model'] });
    }
  }

  // ================================================================ band

  signals.sort((a, b) => b.weight - a.weight);
  conclusions.sort((a, b) => bandRank(b.floor) - bandRank(a.floor));
  const score = Math.max(0, Math.min(100, signals.reduce((s, x) => s + x.weight, 0)));
  let band: Band = bandFor(score);
  // Without a named reason, an email stops at "Worth a look".
  if (conclusions.length === 0 && bandRank(band) > bandRank('caution')) band = 'caution';
  for (const c of conclusions) band = higherBand(band, c.floor);

  // ================================================================ links that ask before they open

  const risky = new Map<string, LinkFinding>();
  for (const f of findings) if (f.listed || bandRank(f.band) >= bandRank('suspicious')) risky.set(f.href, f);
  for (const f of disguised) if (!risky.has(f.href)) risky.set(f.href, f);
  // In an email Pagida warns about, every link to somewhere unknown asks first.
  const top = conclusions[0];
  if (top && bandRank(band) >= bandRank('suspicious')) {
    for (const l of offBrandLinks) if (!risky.has(l.href)) risky.set(l.href, { href: l.href, band, listed: false, reason: top.title });
  }

  return { band, score, signals, conclusions, senderDomain: domain, riskyLinks: [...risky.values()], evaluatedAt: Date.now() };
}
