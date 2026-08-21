/**
 * Builds the URL half of a PageEvidence object. Pure, synchronous, and safe to
 * call on a URL you have never visited — which is what the right-click
 * "check this link" feature relies on.
 */
import type { DomEvidence, PageEvidence } from './types.js';
import { parseHost } from './util/domain.js';

/** Schemes we have nothing useful to say about. */
const IGNORED_SCHEMES = new Set([
  'chrome:', 'chrome-extension:', 'about:', 'edge:', 'moz-extension:',
  'devtools:', 'view-source:', 'data:', 'blob:', 'file:', 'javascript:',
]);

export function isAnalysable(url: string): boolean {
  try {
    const u = new URL(url);
    return !IGNORED_SCHEMES.has(u.protocol);
  } catch {
    return false;
  }
}

export function evidenceFromUrl(url: string): PageEvidence | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (IGNORED_SCHEMES.has(u.protocol)) return null;

  const { registrableDomain, subdomains } = parseHost(u.hostname);

  return {
    url,
    protocol: u.protocol,
    hostname: u.hostname.toLowerCase(),
    registrableDomain,
    subdomains,
    path: u.pathname,
    query: u.search,
    // URL.username is populated when the address carries `user:pass@host`.
    hasEmbeddedCredentials: u.username.length > 0 || u.password.length > 0,
  };
}

/**
 * A short fingerprint of the things the engine actually scores on a page.
 *
 * The content script uses this to decide whether a DOM mutation is worth
 * re-scoring. Without it, any page with an ad carousel or a live region
 * re-reports continuously — which in an early build meant eight scores and
 * eight domain lookups for a single page load.
 *
 * Floats are quantised so that a one-pixel layout shift, which nudges the
 * dead-link ratio by a rounding error, does not read as a change.
 */
export function evidenceSignature(url: string, dom: DomEvidence): string {
  return [
    url,
    dom.hasPasswordField ? 1 : 0,
    dom.passwordFormActions.join('|'),
    dom.crossOriginPasswordForm ? 1 : 0,
    dom.insecurePasswordFormAction ? 1 : 0,
    dom.hiddenIframeCount,
    dom.brandTokens.join(','),
    dom.externalFavicon ? 1 : 0,
    dom.pasteBlocked ? 1 : 0,
    dom.contextMenuBlocked ? 1 : 0,
    Math.round(dom.obfuscationScore * 20),
    Math.round(dom.deadLinkRatio * 20),
  ].join('~');
}
