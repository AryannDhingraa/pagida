/**
 * Tier 2 — page content rules.
 *
 * These only run when a content script has actually looked at the rendered page.
 * They are the strongest evidence the engine has, because they describe what the
 * page is *doing* rather than what it is called.
 */
import type { Rule, Signal } from '../types.js';
import { parseHost } from '../util/domain.js';
import { BRAND_DOMAINS, domainsForToken, isWellKnown } from '../data/index.js';

/**
 * Cosmetic and structural heuristics are suppressed on domains that are
 * demonstrably real; rules about what a page *does* with your credentials never
 * are. A well-known site that has been compromised and is posting passwords to
 * a third party still scores exactly as it should.
 */
function isTrustedName(registrableDomain: string): boolean {
  return BRAND_DOMAINS.has(registrableDomain) || isWellKnown(registrableDomain);
}

const sig = (s: Signal): Signal => s;

/** Credentials typed into an unencrypted page travel in the clear. */
export const passwordOverHttp: Rule = (e) => {
  if (!e.dom?.hasPasswordField) return null;
  if (e.protocol === 'https:') return null;
  return sig({
    id: 'password_field_over_http',
    title: 'Password box on an unencrypted page',
    detail: 'This page asks for a password but the connection is not encrypted. Anything you type here can be read by anyone on the network.',
    tier: 'dom',
    weight: 35,
  });
};

/** The login form submits somewhere other than the site you are on. */
export const crossOriginLoginForm: Rule = (e) => {
  if (!e.dom?.crossOriginPasswordForm) return null;
  const targets = e.dom.passwordFormActions
    .map((a) => { try { return parseHost(new URL(a).hostname).registrableDomain; } catch { return null; } })
    .filter((d): d is string => !!d && d !== parseHost(e.hostname).registrableDomain);
  const target = targets[0] ?? 'another site';
  return sig({
    id: 'cross_origin_password_form',
    title: 'Login form sends your password elsewhere',
    detail: `The password box on this page submits to ${target}, not to ${parseHost(e.hostname).registrableDomain}. That is how stolen credentials are collected.`,
    tier: 'dom',
    weight: 32,
  });
};

/** An https page posting credentials over http. */
export const insecureFormAction: Rule = (e) => {
  if (!e.dom?.insecurePasswordFormAction) return null;
  return sig({
    id: 'insecure_password_form_action',
    title: 'Login form submits without encryption',
    detail: 'The page looks secure, but the login form sends your password over an unencrypted connection.',
    tier: 'dom',
    weight: 30,
  });
};

/** The page claims to be a brand that does not own this domain. */
export const brandContentMismatch: Rule = (e) => {
  const tokens = e.dom?.brandTokens ?? [];
  if (tokens.length === 0) return null;
  const { registrableDomain } = parseHost(e.hostname);
  if (BRAND_DOMAINS.has(registrableDomain)) return null;

  for (const token of tokens) {
    const legit = domainsForToken(token);
    if (legit.length === 0 || legit.includes(registrableDomain)) continue;
    return sig({
      id: 'brand_content_mismatch',
      title: `Page presents itself as ${token}`,
      detail: `This page uses ${token} branding, but it is hosted on ${registrableDomain}. ${token} pages are served from ${legit.slice(0, 2).join(' or ')}.`,
      tier: 'dom',
      weight: e.dom?.hasPasswordField ? 24 : 16,
    });
  }
  return null;
};

/**
 * A favicon hotlinked from a brand the page does not belong to.
 *
 * The first version of this fired on *any* cross-domain favicon, which is how
 * essentially every large site serves one — Google loads its icon from gstatic,
 * and the rule flagged Google. It now only fires on the actual attack: a site
 * that is not itself well known, serving a brand's own icon from the brand's
 * own domain, which is what happens when someone copies a login page wholesale.
 */
export const externalFavicon: Rule = (e) => {
  const d = e.dom;
  if (!d?.externalFavicon || !d.faviconHost) return null;

  const { registrableDomain } = parseHost(e.hostname);
  if (isTrustedName(registrableDomain)) return null;

  const faviconDomain = parseHost(d.faviconHost).registrableDomain;
  if (!BRAND_DOMAINS.has(faviconDomain)) return null;

  return sig({
    id: 'hotlinked_brand_favicon',
    title: 'Tab icon is taken straight from another company',
    detail: `The icon in the browser tab is being loaded from ${faviconDomain}, which has nothing to do with ${registrableDomain}. Copied login pages usually copy the icon too.`,
    tier: 'dom',
    weight: 18,
  });
};

/** Anti-analysis behaviour: blocking paste or right-click. */
export const antiAnalysisBehaviour: Rule = (e) => {
  const d = e.dom;
  if (!d) return null;
  if (isTrustedName(parseHost(e.hostname).registrableDomain)) return null;
  const reasons: string[] = [];
  if (d.pasteBlocked) reasons.push('blocks pasting into the password box');
  if (d.contextMenuBlocked) reasons.push('blocks the right-click menu');
  if (reasons.length === 0) return null;
  return sig({
    id: 'anti_analysis_behaviour',
    title: 'Page restricts normal browser behaviour',
    detail: `This page ${reasons.join(' and ')}. Legitimate sites stopped doing this years ago; phishing pages do it to stop password managers and to make inspection harder.`,
    tier: 'dom',
    weight: reasons.length > 1 ? 14 : 10,
  });
};

/** Hidden iframes — overlay and clickjacking technique. */
export const hiddenIframes: Rule = (e) => {
  if (isTrustedName(parseHost(e.hostname).registrableDomain)) return null;
  const n = e.dom?.hiddenIframeCount ?? 0;
  if (n < 1) return null;
  return sig({
    id: 'hidden_iframes',
    title: `${n} hidden frame${n === 1 ? '' : 's'} on the page`,
    detail: 'Invisible frames can load content you cannot see, or sit over the page to capture clicks.',
    tier: 'dom',
    weight: Math.min(6 + n * 3, 14),
  });
};

/** Obfuscated inline JavaScript. */
export const obfuscatedScripts: Rule = (e) => {
  // Minified and bundled JavaScript on a real site trips every marker this
  // looks for. On a site nobody has heard of it still means something.
  if (isTrustedName(parseHost(e.hostname).registrableDomain)) return null;
  const score = e.dom?.obfuscationScore ?? 0;
  if (score < 0.35) return null;
  return sig({
    id: 'obfuscated_inline_script',
    title: 'Page code is deliberately hard to read',
    detail: 'Inline scripts on this page are heavily encoded. That is normal for some ad tech, but it is also how phishing kits hide what they do.',
    tier: 'dom',
    weight: score > 0.7 ? 14 : 9,
  });
};

/** A login page whose navigation goes nowhere — a single-page kit. */
export const deadNavigation: Rule = (e) => {
  const d = e.dom;
  if (!d?.hasPasswordField) return null;
  if (d.linkCount < 5) return null;
  if (d.deadLinkRatio < 0.8) return null;
  return sig({
    id: 'dead_navigation_links',
    title: 'Menu links on this page do not go anywhere',
    detail: `${Math.round(d.deadLinkRatio * 100)}% of the links here are dead. Phishing kits copy a login page and leave the rest of the site missing.`,
    tier: 'dom',
    weight: 18,
  });
};

export const DOM_RULES: Rule[] = [
  passwordOverHttp,
  crossOriginLoginForm,
  insecureFormAction,
  brandContentMismatch,
  externalFavicon,
  antiAnalysisBehaviour,
  hiddenIframes,
  obfuscatedScripts,
  deadNavigation,
];
