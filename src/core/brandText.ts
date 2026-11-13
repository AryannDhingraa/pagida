/**
 * Which brand does a page claim to BE, as opposed to which brands it mentions?
 *
 * v3 answered a different question. It glued the title, headings, image alt
 * text and every button label into one string with the spaces removed and ran
 * a substring search over it. That made three classes of false positive:
 *
 *  1. Social sign-in. "Continue with Google" on Figma's login page made Figma
 *     "a Google sign-in page on a domain Google does not own". Every SaaS login
 *     page has one of these buttons.
 *  2. Payment and partner logos. "Pay with PayPal", an Afterpay badge, a Visa
 *     logo in the footer.
 *  3. Substrings. "purchase" contains "chase", "otherwise" contains "wise",
 *     "permit" contains "rmit", "sales team" with the space removed contains
 *     "steam".
 *
 * The fix is to look only where a page states its own identity (title, site
 * name, main heading, logo, the heading over the sign-in form), to match whole
 * words, and to throw away the phrases that name somebody else's service.
 *
 * Pure string logic, no DOM, so the Node tests and the evaluation harness run
 * the same code as the content script.
 */
import { BRAND_TOKENS } from './data/brands.js';

/**
 * Tokens that are also ordinary English words or very common product nouns.
 * These only count when they appear in the page's title or site name, where a
 * page names itself, never in body headings or alt text.
 */
export const AMBIGUOUS_TOKENS: ReadonlySet<string> = new Set([
  'apple', 'booking', 'canvas', 'chase', 'coles', 'discord', 'kraken', 'ledger',
  'linkt', 'optus', 'slack', 'steam', 'stripe', 'uber', 'visa', 'wise', 'zoom',
  'amazon', 'outlook', 'telegram', 'twitter', 'myki', 'medicare', 'blackboard',
  'notion', 'proton', 'agl', 'interbank', 'dkb', 'evri', 'dpd', 'kayo', 'humm', 'osko', 'okta', 'temu', 'etsy', 'twitch', 'xero',
]);

/**
 * Phrases that name a third party the page works WITH, not a brand it claims
 * to be. Removed before matching.
 */
// "Sign in with Google" names a third party. "Sign in with your Microsoft
// account" is the classic phishing heading and must NOT be stripped, so the
// word after the preposition may not be a possessive or an article.
const NOT_POSSESSIVE = '(?!(?:your|my|the|an?|our)\\b)';
const P = (s: string) => new RegExp(s.replace(/NP/g, NOT_POSSESSIVE), 'gi');

const THIRD_PARTY_PHRASES: RegExp[] = [
  P('\\b(?:sign|log)\\s*(?:in|on|up)\\s+(?:with|using|via|through)\\s+NP[\\w&.-]+'),
  P('\\b(?:continue|connect|login|register|join|signup)\\s+(?:with|using|via|to)\\s+NP[\\w&.-]+'),
  P('\\b(?:pay|checkout|buy)\\s+(?:with|using|via|later\\s+with|in\\s+\\d+\\s+with)\\s+NP[\\w&.-]+'),
  /\b[\w&.-]+\s+pay\b/gi, // Apple Pay, Google Pay, Amazon Pay, Shop Pay
  /\b(?:powered|secured|protected|verified)\s+by\s+[\w&.-]+/gi,
  /\b(?:available|download|get\s+it)\s+on\s+(?:the\s+)?[\w&.-]+(?:\s+[\w&.-]+)?/gi, // app store badges
  /\bfollow\s+us\s+on\s+[\w&.-]+/gi,
  /\bshare\s+(?:on|to|via)\s+[\w&.-]+/gi,
  /\b(?:add|install)\s+to\s+[\w&.-]+/gi,
];

export function stripThirdParty(text: string): string {
  let out = text;
  for (const re of THIRD_PARTY_PHRASES) out = out.replace(re, ' ');
  return out;
}

/** Lowercase words, punctuation as separators. "JB Hi-Fi" -> ["jb","hi","fi"]. */
export function words(text: string): string[] {
  return text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
}

/**
 * Brand tokens present as whole words, or as two or three adjacent words run
 * together ("Commonwealth Bank" -> commonwealthbank, "JB Hi-Fi" -> jbhifi).
 */
export function wholeWordTokens(text: string, allowAmbiguous: boolean): string[] {
  const w = words(stripThirdParty(text));
  const grams = new Set<string>();
  for (let i = 0; i < w.length; i++) {
    grams.add(w[i]!);
    if (i + 1 < w.length) grams.add(w[i]! + w[i + 1]!);
    if (i + 2 < w.length) grams.add(w[i]! + w[i + 1]! + w[i + 2]!);
  }
  return BRAND_TOKENS.filter((t) =>
    t.length >= 3 && grams.has(t) && (allowAmbiguous || !AMBIGUOUS_TOKENS.has(t)));
}

/** The places a page says what it is, gathered by the content script. */
export interface IdentityText {
  /** document.title and og:site_name / application-name. Strongest. */
  selfName: string[];
  /** First h1s, and the heading nearest a visible password field. */
  headings: string[];
  /** Alt / aria-label of images that look like a logo (alt or class mentions "logo", or sit in header). */
  logos: string[];
}

/**
 * The brands this page presents itself as, strongest evidence first.
 * Ambiguous tokens are only accepted from the page's own name.
 */
export function identityBrands(t: IdentityText): string[] {
  const found: string[] = [];
  const add = (xs: string[]) => { for (const x of xs) if (!found.includes(x)) found.push(x); };
  add(wholeWordTokens(t.selfName.join(' . '), true));
  add(wholeWordTokens(t.headings.join(' . '), false));
  add(wholeWordTokens(t.logos.join(' . '), false));
  return found.slice(0, 5);
}
