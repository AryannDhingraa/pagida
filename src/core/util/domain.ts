/**
 * Domain parsing, against the real Public Suffix List.
 *
 * Working out who owns a domain is the foundation everything else stands on.
 * Brand comparison, typosquat distance, the well-known allowlist, and the guard
 * that stops the credential-theft conclusion firing on a brand's own site all
 * ask this module the same question: what did somebody actually buy here?
 *
 * Pagida used to answer that with a hand-written list of ~100 common multi-part
 * suffixes and a "last two labels" fallback. That was a size trade-off, and it
 * was the wrong one — a mis-parsed suffix does not produce a slightly worse
 * score, it produces a confident answer about the wrong domain. The full list
 * now ships, compiled at build time into `../data/psl.ts` (~35KB gzipped in the
 * package).
 *
 * The algorithm is the one the PSL specification defines:
 *   1. The longest matching rule wins.
 *   2. A wildcard rule `*.ck` makes every label under `ck` a suffix.
 *   3. An exception rule `!www.ck` overrides its wildcard.
 *   4. A host matching no rule at all gets a single-label suffix.
 */
import { PSL_RULES, PSL_WILDCARDS, PSL_EXCEPTIONS } from '../data/psl.js';

// Split once, at module load. Around a millisecond, and every lookup after
// that is a hash probe.
const RULES = new Set(PSL_RULES.split('\n'));
const WILDCARDS = new Set(PSL_WILDCARDS.split('\n'));
const EXCEPTIONS = new Set(PSL_EXCEPTIONS.split('\n'));

/**
 * How many trailing labels form the public suffix of this host.
 *
 * Returns at least 1, so a host under an unknown TLD is still split somewhere
 * sensible rather than being treated as one opaque blob.
 */
function suffixLabelCount(labels: string[]): number {
  // Exceptions first: `!www.ck` means `www.ck` is registrable, so its suffix is
  // one label shorter than the wildcard would otherwise make it.
  for (let take = labels.length; take >= 1; take--) {
    if (EXCEPTIONS.has(labels.slice(-take).join('.'))) return take - 1;
  }

  // Longest plain rule wins.
  let best = 0;
  for (let take = Math.min(labels.length, 6); take >= 1; take--) {
    if (RULES.has(labels.slice(-take).join('.'))) { best = take; break; }
  }

  // A wildcard one label shorter beats a plain rule of the same length, because
  // `*.foo.bar` is by definition more specific than `foo.bar`.
  for (let take = Math.min(labels.length - 1, 5); take >= 1; take--) {
    if (WILDCARDS.has(labels.slice(-take).join('.'))) {
      best = Math.max(best, take + 1);
      break;
    }
  }

  return Math.max(1, Math.min(best, labels.length));
}

export interface ParsedHost {
  hostname: string;
  /** eTLD+1 — the thing a person actually buys. */
  registrableDomain: string;
  /** The public suffix, e.g. `com` or `co.uk`. */
  suffix: string;
  /** The label immediately in front of the suffix, e.g. `paypal`. */
  sld: string;
  /** Labels in front of the registrable domain, outermost first. */
  subdomains: string[];
  /** True when the host is a bare IPv4/IPv6 literal rather than a name. */
  isIpLiteral: boolean;
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export function parseHost(rawHostname: string): ParsedHost {
  const hostname = rawHostname.toLowerCase().replace(/\.$/, '');

  if (IPV4.test(hostname) || hostname.includes(':') || hostname.startsWith('[')) {
    return {
      hostname, registrableDomain: hostname, suffix: '', sld: hostname,
      subdomains: [], isIpLiteral: true,
    };
  }

  const labels = hostname.split('.').filter(Boolean);
  if (labels.length <= 1) {
    return {
      hostname, registrableDomain: hostname, suffix: '', sld: hostname,
      subdomains: [], isIpLiteral: false,
    };
  }

  const take = suffixLabelCount(labels);
  const suffix = labels.slice(-take).join('.');
  const sld = labels[labels.length - take - 1] ?? '';
  const registrableDomain = sld ? `${sld}.${suffix}` : suffix;
  const subdomains = labels.slice(0, Math.max(0, labels.length - take - 1));

  return { hostname, registrableDomain, suffix, sld, subdomains, isIpLiteral: false };
}

/** True when two URLs sit on the same registrable domain. */
export function sameSite(a: string, b: string): boolean {
  try {
    return (
      parseHost(new URL(a).hostname).registrableDomain ===
      parseHost(new URL(b).hostname).registrableDomain
    );
  } catch {
    return false;
  }
}
