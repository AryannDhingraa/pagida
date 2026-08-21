/**
 * Domain parsing without shipping the full Public Suffix List.
 *
 * The real PSL is ~230KB and changes constantly. For a browser extension where
 * every kilobyte is visible in the store listing, we ship a compact list of the
 * multi-part suffixes that actually matter and fall back to "last two labels"
 * for everything else. This is documented as a known limitation in the README —
 * it can mis-parse exotic suffixes, and the cost of that is a slightly wrong
 * brand comparison, never a wrong verdict on its own.
 */

/** Two-part public suffixes, by far the most common shape after the generics. */
const MULTIPART_SUFFIXES = new Set([
  // Australia (Aryan's home market — these matter most for local brands)
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'asn.au', 'id.au',
  // United Kingdom
  'co.uk', 'org.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'net.uk', 'sch.uk', 'ac.uk', 'gov.uk', 'nhs.uk',
  // New Zealand
  'co.nz', 'net.nz', 'org.nz', 'govt.nz', 'ac.nz', 'school.nz',
  // Asia-Pacific
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp', 'co.kr', 'or.kr', 'co.in', 'net.in',
  'org.in', 'gov.in', 'ac.in', 'com.sg', 'com.my', 'com.ph', 'com.hk', 'com.cn',
  'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'com.tw', 'co.th', 'co.id',
  // Americas
  'com.br', 'net.br', 'org.br', 'gov.br', 'com.mx', 'com.ar', 'com.co', 'com.pe',
  'com.ve', 'com.uy', 'co.cr',
  // Europe
  'co.at', 'or.at', 'com.es', 'com.pl', 'com.pt', 'com.tr', 'com.ua', 'com.ro',
  'com.gr', 'com.hr', 'com.cy', 'co.il', 'com.ru', 'net.ru', 'org.ru',
  // Africa & Middle East
  'co.za', 'org.za', 'net.za', 'gov.za', 'ac.za', 'co.ke', 'com.ng', 'com.eg',
  'com.sa', 'com.ae', 'co.ae',
  // Hosting suffixes where each subdomain is a separate owner
  'github.io', 'gitlab.io', 'netlify.app', 'vercel.app', 'pages.dev', 'workers.dev',
  'web.app', 'firebaseapp.com', 'herokuapp.com', 'azurewebsites.net',
  's3.amazonaws.com', 'cloudfront.net', 'blogspot.com', 'wordpress.com',
  'weebly.com', 'wixsite.com', 'square.site', 'myshopify.com', 'glitch.me',
  'repl.co', 'replit.dev', 'ngrok.io', 'ngrok-free.app', 'trycloudflare.com',
  'r2.dev', 'sharepoint.com', 'onedrive.live.com', 'duckdns.org', 'serveo.net',
]);

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

/**
 * Second-level labels that act as public suffixes under a two-letter country
 * code — `google.com.pk` is owned by Google, not by whoever owns `com.pk`.
 * Enumerating every country's list is what the full PSL is for; this covers the
 * generic pattern that accounts for almost all of them.
 */
const CC_SECOND_LEVEL = new Set([
  'com', 'net', 'org', 'edu', 'gov', 'mil', 'int', 'ac', 'co', 'or', 'ne',
  'go', 'gob', 'gouv', 'govt', 'asn', 'id', 'biz', 'info', 'name', 'nom',
  'gen', 'sch', 'res', 'web', 'firm', 'ind', 'priv', 'plc', 'ltd', 'in',
]);

function isCcSecondLevel(labels: string[]): boolean {
  if (labels.length < 2) return false;
  const tld = labels[labels.length - 1]!;
  const second = labels[labels.length - 2]!;
  return tld.length === 2 && CC_SECOND_LEVEL.has(second);
}

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

  // Try the longest known multi-part suffix first, then the generic
  // country-code pattern, then fall back to a single label.
  let suffixLabelCount = 1;
  for (let take = Math.min(3, labels.length - 1); take >= 2; take--) {
    const candidate = labels.slice(-take).join('.');
    if (MULTIPART_SUFFIXES.has(candidate)) {
      suffixLabelCount = take;
      break;
    }
  }
  if (suffixLabelCount === 1 && labels.length > 2 && isCcSecondLevel(labels)) {
    suffixLabelCount = 2;
  }

  const suffix = labels.slice(-suffixLabelCount).join('.');
  const sld = labels[labels.length - suffixLabelCount - 1] ?? '';
  const registrableDomain = sld ? `${sld}.${suffix}` : suffix;
  const subdomains = labels.slice(0, Math.max(0, labels.length - suffixLabelCount - 1));

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
