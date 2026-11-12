/**
 * v5 offline evidence, read from the live page.
 *
 * Everything here stays on the machine. What goes to the service worker is a
 * handful of booleans and brand names, plus (for ClickFix only) the first 300
 * characters of a command the page itself tried to put on the clipboard.
 */
import type { DomEvidence } from '../../core/types.js';
import { BITB_HOSTS, BRAND_ASSET_HOSTS, LOGIN_FINGERPRINTS } from '../../core/data/fingerprints.js';
import {
  exfilTarget, hasRunInstructions, isBotExfil, isClickFix, isCryptoClaimLure, isDocumentLure,
  isTechSupportScam, looksHostile, looksLikeCommand, mentionsSeedPhrase,
} from '../../core/lures.js';
import { score as modelScore } from '../../learned/textModel.js';
import { PAGE_MODEL } from '../../learned/data/pageModel.js';

type Offline = Pick<DomEvidence,
  'loginFingerprints' | 'brandAssets' | 'faviconUrl' | 'asksCard' | 'asksOneTimeCode' | 'asksSeedPhrase' | 'formAsksPassword' | 'formAsksEmail'
  | 'exfilTarget' | 'botExfil' | 'clipboardCommand' | 'clickFix' | 'runInstructions' | 'techSupportScam'
  | 'documentLure' | 'cryptoLure' | 'fakeAddressBar' | 'textModelScore'>;

function visible(el: Element): boolean {
  const r = (el as HTMLElement).getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const st = getComputedStyle(el);
  return st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity) > 0.05;
}

function matchesAny(sel: string): boolean {
  try { return document.querySelector(sel) !== null; } catch { return false; }
}

function loginFingerprints(): string[] {
  const out: string[] = [];
  for (const fp of LOGIN_FINGERPRINTS) {
    let hits = 0;
    for (const sel of fp.selectors) if (matchesAny(sel)) hits++;
    if (hits >= fp.need && !out.includes(fp.brand)) out.push(fp.brand);
  }
  return out;
}

function brandAssets(): string[] {
  const out = new Set<string>();
  const els = document.querySelectorAll<HTMLElement>('link[rel~="stylesheet"][href], link[rel~="icon"][href], script[src], img[src]');
  for (const el of Array.from(els).slice(0, 400)) {
    const raw = el.getAttribute('src') ?? el.getAttribute('href') ?? '';
    try {
      const host = new URL(raw, location.href).hostname.toLowerCase();
      const brand = BRAND_ASSET_HOSTS[host];
      if (brand) out.add(brand);
    } catch { /* skip */ }
  }
  return [...out];
}

export function faviconUrl(): string | undefined {
  const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
  const href = link?.getAttribute('href') || '/favicon.ico';
  try {
    const u = new URL(href, location.href);
    return u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'data:' ? u.href.slice(0, 4000) : undefined;
  } catch { return undefined; }
}

/** The text that names a field: its own attributes, its <label>, and what aria-labelledby points to (how Google Forms labels questions). */
const LABEL = (i: HTMLInputElement) => {
  const by = (i.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean).slice(0, 4)
    .map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
  return `${i.name} ${i.id} ${i.getAttribute('autocomplete') ?? ''} ${i.getAttribute('aria-label') ?? ''} ${i.placeholder} ${i.labels?.[0]?.textContent ?? ''} ${by.slice(0, 200)}`.toLowerCase();
};

/** "Password", in the languages phishing forms use most. Not "password manager" or "forgot your password". */
const PASSWORD_WORD = /\b(?:password|passcode|passwort|kennwort|contrase[ñn]a|mot de passe|senha|wachtwoord|parola|has[łl]o|pass ?word)\b(?!\s*(?:manager|hint|reset|policy))/;
const NOT_A_PASSWORD_ASK = /forgot|reset|manager|change your|new password/;
const EMAIL_WORD = /\b(?:e-?mail|username|user ?name|user id|login|correo|adresse|benutzername)\b/;

function asks(text: string): Pick<Offline, 'asksCard' | 'asksOneTimeCode' | 'asksSeedPhrase' | 'formAsksPassword' | 'formAsksEmail'> {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input:not([type="hidden"]), textarea'))
    .filter(visible).slice(0, 80);
  let card = false; let otp = false; let wordBoxes = 0; let bigTextarea = false;
  let pwText = false; let emailField = false;
  for (const i of inputs) {
    const l = LABEL(i);
    const kind = (i.getAttribute('type') ?? 'text').toLowerCase();
    if (kind === 'email' || EMAIL_WORD.test(l)) emailField = true;
    // A password asked for in an ordinary text field: real sign-in pages use a password box.
    if (kind !== 'password' && PASSWORD_WORD.test(l) && !NOT_A_PASSWORD_ASK.test(l)) pwText = true;
    if (/cc-number|card.?num|cardnumber|ccnum|credit.?card|debit.?card|card no/.test(l)) card = true;
    if (/one-time-code|\botp\b|one.?time|verification.?code|sms.?code|security.?code|2fa|mfa|auth.?code|passcode/.test(l)
      && !/cvv|cvc|csc/.test(l)) otp = true;
    if (i instanceof HTMLInputElement && /^(?:word|phrase|seed|mnemonic)?\s*#?\d{1,2}$|word.?\d{1,2}|seed|mnemonic|recovery.?phrase|secret.?phrase/.test(l)) wordBoxes++;
    if (i instanceof HTMLTextAreaElement && /phrase|seed|mnemonic|recovery|private key/.test(l)) bigTextarea = true;
  }
  const seed = mentionsSeedPhrase(text) && (wordBoxes >= 12 || bigTextarea
    || (inputs.some((i) => i instanceof HTMLTextAreaElement) && /enter|type|paste|import|restore|validate|sync/i.test(text)));
  return { asksCard: card, asksOneTimeCode: otp, asksSeedPhrase: seed, formAsksPassword: pwText, formAsksEmail: emailField };
}

function exfil(): Pick<Offline, 'exfilTarget' | 'botExfil'> {
  const actions = Array.from(document.forms).map((f) => f.getAttribute('action') ?? '').join(' ');
  const srcs = Array.from(document.querySelectorAll('script[src]')).map((s) => s.getAttribute('src') ?? '').join(' ');
  const inline = Array.from(document.querySelectorAll<HTMLScriptElement>('script:not([src])'))
    .map((s) => s.textContent ?? '').join('\n').slice(0, 300_000);
  const all = `${actions} ${srcs} ${inline}`;
  return { exfilTarget: exfilTarget(all) ?? undefined, botExfil: isBotExfil(all) };
}

/** A brand sign-in address drawn as plain text inside a box that pretends to be a window. */
function fakeAddressBar(): string | undefined {
  const here = location.hostname.toLowerCase();
  const candidates = document.querySelectorAll<HTMLElement>('div, span, p, input[readonly]');
  let n = 0;
  for (const el of Array.from(candidates)) {
    if (++n > 3000) break;
    if (el.closest('a')) continue;
    const raw = (el instanceof HTMLInputElement ? el.value : (el.childElementCount === 0 ? el.textContent : '')) ?? '';
    const t = raw.trim().toLowerCase();
    if (t.length < 8 || t.length > 120) continue;
    const m = t.match(/^(?:https?:\/\/)?([a-z0-9.-]+)(?:\/\S*)?$/);
    if (!m) continue;
    const host = m[1]!;
    if (!BITB_HOSTS.has(host) || host === here) continue;
    if (!visible(el)) continue;
    // The fake window has to be floating over the page.
    for (let p: HTMLElement | null = el; p && p !== document.body; p = p.parentElement) {
      const pos = getComputedStyle(p).position;
      if (pos === 'fixed' || pos === 'absolute') return host;
    }
  }
  return undefined;
}

/** Set by the clipboard watcher (main world) when the page copies a command. */
let lastClipboard: string | undefined;
export function noteClipboard(text: string): void {
  const next = text.slice(0, 300);
  // The message this arrives in can be forged by the page, so a later one may
  // add to what was seen but never clear it: a command is not replaced by
  // plain text, and a hostile command is not replaced by a tamer one.
  if (lastClipboard !== undefined) {
    if (looksLikeCommand(lastClipboard) && !looksLikeCommand(next)) return;
    if (looksHostile(lastClipboard) && !looksHostile(next)) return;
  }
  lastClipboard = next;
}

export function extractOffline(): Offline {
  const text = (document.body?.innerText ?? '').slice(0, 20_000);
  const isLoginish = document.querySelector('input[type="password"], input[type="email"], input[autocomplete="username"]') !== null;
  return {
    loginFingerprints: loginFingerprints(),
    brandAssets: brandAssets(),
    faviconUrl: faviconUrl(),
    ...asks(text),
    ...exfil(),
    clipboardCommand: lastClipboard,
    clickFix: isClickFix(lastClipboard, text),
    runInstructions: hasRunInstructions(text),
    techSupportScam: isTechSupportScam(text),
    documentLure: isDocumentLure(text),
    cryptoLure: isCryptoClaimLure(text),
    fakeAddressBar: isLoginish || document.querySelector('iframe') ? fakeAddressBar() : undefined,
    // Only the number leaves the page, never the words.
    textModelScore: isLoginish ? modelScore(PAGE_MODEL, `${document.title}\n${text}`) : null,
  };
}
