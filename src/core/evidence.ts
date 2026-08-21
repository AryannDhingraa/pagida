/**
 * Builds the URL half of a PageEvidence object. Pure, synchronous, and safe to
 * call on a URL you have never visited — which is what the right-click
 * "check this link" feature relies on.
 */
import type { PageEvidence } from './types.js';
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
