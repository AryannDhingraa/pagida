/**
 * Sites you really sign in to, and pages that pretend to be one of them.
 *
 * Pagida's brand list knows a few hundred brands. It cannot know your credit
 * union, your council's rates portal or your company's sign-in page. You can:
 * you sign in there every week. So when you sign in on a page Pagida already
 * judged clean, it remembers that site and the fingerprint of its tab icon,
 * here on this computer. A later page on a different site that wears the same
 * icon and asks for a password is copying a site you use, and Pagida can say
 * which one.
 *
 * Pure on purpose: the worker fetches and stores, this decides.
 */
import { hamming, informative } from './util/dhash.js';
import { parseHost } from './util/domain.js';

/** Registrable domain → what Pagida remembers about signing in there. */
export type SignInMemory = Record<string, { icon: string; at: number }>;

/** Enough for anyone's real accounts, small enough to scan on every check. */
export const SIGN_IN_LIMIT = 300;
/** Same threshold as brand logo matching, tuned there on 356 real favicons. */
const MAX_DISTANCE = 4;

/** Remember (or refresh) a site the person signed in to. Oldest go first when full. */
export function rememberSignIn(memory: SignInMemory, domain: string, icon: string, now: number): SignInMemory {
  if (!domain || !informative(icon)) return memory;
  const next: SignInMemory = { ...memory, [domain]: { icon, at: now } };
  const keys = Object.keys(next);
  if (keys.length <= SIGN_IN_LIMIT) return next;
  keys.sort((a, b) => next[a]!.at - next[b]!.at);
  for (const k of keys.slice(0, keys.length - SIGN_IN_LIMIT)) delete next[k];
  return next;
}

/** The part of a domain that names the organisation: "anz" for anz.com.au. */
function orgLabel(domain: string): string {
  return parseHost(domain).sld;
}

/**
 * The remembered site this page is copying, or null.
 *
 * Not a match:
 *  - the page's own site, or a site of the same organisation under another
 *    ending (anz.com and anz.com.au),
 *  - an icon that two or more of your own different sites share. That is a
 *    platform's default icon (a site builder, a hosting panel), not anyone's
 *    identity.
 */
export function copiedSignInSite(memory: SignInMemory, pageDomain: string, icon: string | undefined): string | null {
  if (!icon || !informative(icon) || memory[pageDomain]) return null;
  const pageOrg = orgLabel(pageDomain);
  const close = Object.entries(memory).filter(([, v]) => hamming(v.icon, icon) <= MAX_DISTANCE);
  const orgs = new Set(close.map(([d]) => orgLabel(d)));
  if (orgs.size !== 1) return null;
  const [domain] = close[0]!;
  if (orgLabel(domain) === pageOrg) return null;
  return domain;
}
