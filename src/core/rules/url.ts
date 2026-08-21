/**
 * Tier 1 — URL and domain rules.
 *
 * These need nothing but the address bar: no network, no page content, no
 * permissions. They run on every navigation and on any link the user asks about
 * from the right-click menu, which is why they carry most of the engine's weight.
 */
import type { Rule, Signal } from '../types.js';
import { parseHost } from '../util/domain.js';
import { editDistance } from '../util/levenshtein.js';
import { hasConfusables, isMixedScript, isPunycode, skeleton } from '../util/homograph.js';
import { FREE_HOSTING_SUFFIXES, looksGenerated } from '../util/entropy.js';
import {
  BRAND_DOMAINS, BRAND_TOKENS, domainsForToken,
  CHEAP_ABUSE_TLDS, FREE_TLDS, isWellKnown, RISKY_DOWNLOAD_EXTENSIONS, URL_SHORTENERS,
} from '../data/index.js';

/**
 * Lookalike rules are suppressed for domains that are themselves well known.
 * A brand domain is exempt because it is the brand; a top-1,000 domain is exempt
 * because a site that millions of people visit every day is not a typosquat of
 * anything, however close its spelling happens to sit to a brand name.
 *
 * Note what this does NOT exempt: everything on the page-content tier still
 * applies. A well-known site that has been compromised and is serving someone
 * else's credential form scores exactly as it should.
 */
function isTrustedName(registrableDomain: string): boolean {
  return BRAND_DOMAINS.has(registrableDomain) || isWellKnown(registrableDomain);
}

const sig = (s: Signal): Signal => s;

/** Words phishing kits put in a hostname to look official. */
const TRUST_WORDS = [
  'secure', 'login', 'signin', 'verify', 'verification', 'account', 'update',
  'confirm', 'support', 'billing', 'payment', 'recovery', 'unlock', 'alert',
  'auth', 'authenticate', 'wallet', 'refund', 'invoice',
];

/** A bare IP address serving a login page is almost never legitimate. */
export const ipLiteralHost: Rule = (e) => {
  const { isIpLiteral } = parseHost(e.hostname);
  if (!isIpLiteral) return null;
  return sig({
    id: 'host_is_ip_literal',
    title: 'Address is a raw IP, not a domain name',
    detail: `This page is served from ${e.hostname} directly. Real services almost always use a domain name.`,
    tier: 'url',
    weight: 25,
  });
};

/** Punycode or mixed alphabets in the hostname — the homograph attack. */
export const homographHost: Rule = (e) => {
  const labels = e.hostname.split('.');
  const punycoded = labels.some(isPunycode);
  const mixed = isMixedScript(e.hostname);

  // Mixed alphabets inside one label is the actual attack: a Latin-looking name
  // with two Cyrillic characters hidden in it. Plain punycode is just an
  // internationalised domain — millions of them are entirely legitimate — so it
  // gets a fraction of the weight and a different explanation.
  if (mixed) {
    return sig({
      id: 'mixed_script_hostname',
      title: 'Hostname mixes two alphabets',
      detail: `${e.hostname} contains characters from more than one alphabet in the same word. That is how lookalike domains are built.`,
      tier: 'url',
      weight: 30,
    });
  }
  if (punycoded) {
    return sig({
      id: 'punycode_hostname',
      title: 'Hostname is written in a non-Latin alphabet',
      detail: `${e.hostname} is an internationalised domain. Usually that is perfectly normal — but it also lets a name be shown that looks like a familiar brand.`,
      tier: 'url',
      weight: 12,
    });
  }
  return null;
};

/**
 * Typosquatting: the registrable domain is within two edits of a known brand
 * domain but is not that domain. Confusable characters are folded first so
 * `paypa1.com` and `pаypal.com` both land on `paypal.com`.
 */
export const brandTyposquat: Rule = (e) => {
  const { registrableDomain, sld, isIpLiteral } = parseHost(e.hostname);
  if (isIpLiteral || !sld) return null;
  if (isTrustedName(registrableDomain)) return null; // it *is* the brand, or a top site

  const foldedSld = skeleton(sld);
  // Short labels are the main source of false typosquat matches — `mail.ru` is
  // one edit from `gmail`, and it is not pretending to be Gmail. Requiring five
  // characters on both sides, similar lengths, and a distance proportionate to
  // the length is what makes this rule safe to weight heavily.
  if (foldedSld.length < 5) return null;

  const allowedDistance = foldedSld.length >= 8 ? 2 : 1;

  for (const brandDomain of BRAND_DOMAINS) {
    const brandSld = brandDomain.split('.')[0]!;
    if (brandSld.length < 5) continue;
    if (Math.abs(brandSld.length - foldedSld.length) > allowedDistance) continue;

    const d = editDistance(foldedSld, brandSld, allowedDistance);
    if (d === 0 && sld !== brandSld) {
      return sig({
        id: 'brand_confusable_domain',
        title: `Domain imitates "${brandSld}"`,
        detail: `${registrableDomain} reads as "${brandSld}" but is not it. The characters have been swapped for lookalikes.`,
        tier: 'url',
        weight: 32,
      });
    }
    if (d > 0 && d <= allowedDistance) {
      return sig({
        id: 'brand_typosquat',
        title: `Domain is a near-miss for "${brandDomain}"`,
        detail: `${registrableDomain} is ${d} character${d === 1 ? '' : 's'} away from ${brandDomain}. Check the spelling carefully.`,
        tier: 'url',
        weight: 30,
      });
    }
  }
  return null;
};

/**
 * The brand name is in the URL, but not in the part that identifies the owner.
 * `paypal.secure-billing.xyz` is owned by whoever bought `secure-billing.xyz`.
 */
export const brandOutsideRegistrable: Rule = (e) => {
  const { registrableDomain, subdomains, isIpLiteral } = parseHost(e.hostname);
  if (isIpLiteral) return null;
  if (BRAND_DOMAINS.has(registrableDomain)) return null;

  const subdomainText = subdomains.join('.').toLowerCase();
  const pathText = e.path.toLowerCase();

  for (const token of BRAND_TOKENS) {
    if (token.length < 4) continue;
    const legit = domainsForToken(token);
    if (legit.includes(registrableDomain)) continue;

    // In the hostname: whoever owns the registrable domain chose to put a brand
    // name in front of it. That is deliberate and almost always impersonation.
    if (subdomainText.includes(token)) {
      return sig({
        id: 'brand_in_subdomain',
        title: `Says "${token}" but the site owner is ${registrableDomain}`,
        detail: `Everything before "${registrableDomain}" can be set by whoever owns that domain, so "${token}" here proves nothing. The real owner of this page is ${registrableDomain}.`,
        tier: 'url',
        weight: 30,
      });
    }

    // In the path only: much weaker. Blogs, news sites and support articles
    // legitimately have brand names in their URLs.
    if (pathText.includes(token)) {
      return sig({
        id: 'brand_in_path',
        title: `Address mentions "${token}"`,
        detail: `"${token}" appears in the page path but this site is ${registrableDomain}. Common on legitimate articles too — weak on its own.`,
        tier: 'url',
        weight: 10,
      });
    }
  }
  return null;
};

/** `https://paypal.com@evil.tk/` — the browser goes to evil.tk. */
export const embeddedCredentials: Rule = (e) => {
  if (!e.hasEmbeddedCredentials) return null;
  return sig({
    id: 'embedded_credentials_in_url',
    title: 'Address hides the real destination',
    detail: `Everything before the "@" in this address is ignored by the browser. The site you actually reached is ${e.hostname}.`,
    tier: 'url',
    weight: 20,
  });
};

/** No transport encryption at all. */
export const noHttps: Rule = (e) => {
  if (e.protocol === 'https:') return null;
  if (e.protocol !== 'http:') return null;
  return sig({
    id: 'no_https',
    title: 'Connection is not encrypted',
    detail: 'This page was loaded over plain HTTP. Anything you type can be read in transit.',
    tier: 'url',
    weight: 15,
  });
};

/** Cheap or free TLDs over-represented in abuse data. */
export const highAbuseTld: Rule = (e) => {
  const { suffix } = parseHost(e.hostname);
  const last = suffix.split('.').pop() ?? '';
  if (FREE_TLDS.has(last)) {
    return sig({
      id: 'free_registration_tld',
      title: `".${last}" domains are free to register`,
      detail: `Anyone can register a .${last} domain at no cost, which is why they are used for phishing far more than for anything else.`,
      tier: 'url',
      weight: 15,
    });
  }
  if (CHEAP_ABUSE_TLDS.has(last)) {
    return sig({
      id: 'high_abuse_tld',
      title: `".${last}" is heavily abused`,
      detail: `Domains ending in .${last} are cheap to register and show up in phishing far more often than their share of the web. Weak on its own.`,
      tier: 'url',
      weight: 8,
    });
  }
  return null;
};

/** Unusually deep subdomain nesting, used to push the real domain off-screen on mobile. */
export const deepSubdomains: Rule = (e) => {
  const { subdomains, isIpLiteral } = parseHost(e.hostname);
  if (isIpLiteral || subdomains.length < 4) return null;
  return sig({
    id: 'deep_subdomain_nesting',
    title: 'Unusually long hostname',
    detail: `${subdomains.length} levels of subdomain. This is often used to push the real domain out of view in a phone's address bar.`,
    tier: 'url',
    weight: 8,
  });
};

/** Trust words stuffed into the hostname. */
export const trustWordsInHost: Rule = (e) => {
  const { registrableDomain, subdomains, sld, isIpLiteral } = parseHost(e.hostname);
  if (isIpLiteral) return null;
  if (isTrustedName(registrableDomain)) return null;
  const hostPart = [...subdomains, sld].join('.');
  const found = TRUST_WORDS.filter((w) => hostPart.includes(w));
  if (found.length === 0) return null;
  return sig({
    id: 'trust_words_in_hostname',
    title: `Hostname contains "${found[0]}"`,
    detail: `Words like "${found.join('", "')}" in a hostname are added to make an address look official. Real services rarely need them.`,
    tier: 'url',
    weight: found.length >= 3 ? 18 : found.length === 2 ? 14 : 10,
  });
};

/** Hyphen and digit stuffing, a signature of bulk-registered kit domains. */
export const noisyDomain: Rule = (e) => {
  const { sld, registrableDomain, isIpLiteral } = parseHost(e.hostname);
  if (isIpLiteral || isTrustedName(registrableDomain) || sld.length < 6) return null;
  const hyphens = (sld.match(/-/g) ?? []).length;
  const digits = (sld.match(/\d/g) ?? []).length;
  if (hyphens < 3 && digits < 4) return null;
  return sig({
    id: 'noisy_domain_name',
    title: 'Domain name looks machine-generated',
    detail: `"${sld}" contains ${hyphens} hyphen${hyphens === 1 ? '' : 's'} and ${digits} digit${digits === 1 ? '' : 's'}. Bulk-registered phishing domains often look like this.`,
    tier: 'url',
    weight: 8,
  });
};

/** URL shortener — hides the destination. Informational weight only. */
export const urlShortener: Rule = (e) => {
  const { registrableDomain } = parseHost(e.hostname);
  if (!URL_SHORTENERS.has(registrableDomain)) return null;
  return sig({
    id: 'url_shortener',
    title: 'Shortened link',
    detail: `${registrableDomain} hides where the link actually goes. Not dangerous by itself, but you can't see the destination.`,
    tier: 'url',
    weight: 5,
  });
};

/** A dangerous file extension sitting directly in the path. */
export const riskyDownloadPath: Rule = (e) => {
  const ext = e.path.split('.').pop()?.toLowerCase() ?? '';
  if (!RISKY_DOWNLOAD_EXTENSIONS.has(ext)) return null;
  return sig({
    id: 'risky_download_in_path',
    title: `Link points at a .${ext} file`,
    detail: `.${ext} files can run code on your machine. Only open one if you are certain where it came from.`,
    tier: 'url',
    weight: 15,
  });
};

/** Very long URLs are used to bury the real host and to carry tracking payloads. */
export const excessiveUrlLength: Rule = (e) => {
  if (e.url.length < 150) return null;
  return sig({
    id: 'excessive_url_length',
    title: 'Very long web address',
    detail: `This address is ${e.url.length} characters long. Length alone is not proof of anything, but it is common in phishing links.`,
    tier: 'url',
    weight: 5,
  });
};

/** Confusable characters anywhere in the host, even without a brand match. */
export const confusableCharacters: Rule = (e) => {
  const { sld, registrableDomain, isIpLiteral } = parseHost(e.hostname);
  if (isIpLiteral || BRAND_DOMAINS.has(registrableDomain)) return null;
  // eslint-disable-next-line no-control-regex -- matching the ASCII range is the point
  if (!/[^\u0000-\u007F]/.test(sld)) return null; // ASCII-only, nothing to fold
  if (!hasConfusables(sld)) return null;
  return sig({
    id: 'confusable_characters',
    title: 'Domain contains lookalike characters',
    detail: `"${sld}" contains characters that render like ordinary letters but are not. This is how convincing fake domains are built.`,
    tier: 'url',
    weight: 22,
  });
};


/**
 * Directories that only exist inside a WordPress installation. A user-facing
 * page is never legitimately served from `/wp-includes/` — when one is, the
 * site has almost certainly been compromised and is hosting someone else's
 * phishing kit. This is the single highest-recall URL signal for modern
 * phishing, which overwhelmingly runs on hacked WordPress sites rather than on
 * purpose-registered domains.
 */
export const compromisedCmsPath: Rule = (e) => {
  const path = e.path.toLowerCase();
  const isAsset = /\.(?:css|js|png|jpe?g|gif|svg|woff2?|ico|webp|mp4)$/.test(path);
  if (isAsset) return null;

  if (path.includes('/wp-includes/')) {
    return sig({
      id: 'wordpress_internal_path',
      title: 'Page is served from a WordPress system folder',
      detail: 'This address points inside /wp-includes/, a folder WordPress uses internally and never serves pages from. Sites that have been broken into are often used to host phishing pages here.',
      tier: 'url',
      weight: 28,
    });
  }
  if (/\/wp-content\/(?:uploads|themes|plugins)\//.test(path) && /\/(?:[^/.]+|[^/]*\.(?:php|html?))$/.test(path)) {
    return sig({
      id: 'wordpress_upload_path',
      title: 'Page is served from a WordPress upload folder',
      detail: 'Pages are not normally served from /wp-content/uploads/. This is a common place for a phishing kit to be dropped on a site that has been compromised.',
      tier: 'url',
      weight: 22,
    });
  }
  return null;
};

/** Free, instant, anonymous hosting — where disposable phishing pages live. */
export const freeHostingSubdomain: Rule = (e) => {
  const { registrableDomain, suffix, isIpLiteral } = parseHost(e.hostname);
  if (isIpLiteral || BRAND_DOMAINS.has(registrableDomain)) return null;
  if (!FREE_HOSTING_SUFFIXES.has(suffix)) return null;
  return sig({
    id: 'free_hosting_subdomain',
    title: `Hosted free on ${suffix}`,
    detail: `Anyone can publish a page on ${suffix} in minutes, anonymously and at no cost. Plenty of real projects do — but so does most disposable phishing.`,
    tier: 'url',
    weight: 12,
  });
};

/** The domain label looks machine-generated rather than chosen. */
export const generatedDomainLabel: Rule = (e) => {
  const { sld, subdomains, registrableDomain, isIpLiteral } = parseHost(e.hostname);
  if (isIpLiteral || isTrustedName(registrableDomain)) return null;

  // Punycode labels are gibberish by construction; that is not evidence.
  const candidates = [sld, ...subdomains].filter((l) => l && !isPunycode(l));
  for (const label of candidates) {
    const { random, reason } = looksGenerated(label);
    if (!random) continue;
    return sig({
      id: 'generated_domain_label',
      title: 'Part of the hostname looks auto-generated',
      detail: `"${label}" does not look like a name anyone chose — ${reason}. Throwaway phishing infrastructure is usually named by a script.`,
      tier: 'url',
      weight: 14,
    });
  }
  return null;
};

/**
 * Long, high-entropy path segments — `/v/60f84723f9ab9f904044f710f98efb70` or a
 * 60-character base64-looking blob. Phishing kits use these as per-victim
 * tokens, so the same page can be served uniquely to each target and taken down
 * selectively. Legitimate sites use readable slugs.
 */
export const generatedPathSegment: Rule = (e) => {
  const segments = e.path.split('/').filter(Boolean);
  for (const raw of segments) {
    const seg = raw.toLowerCase();
    if (seg.length < 16) continue;
    if (/\.(?:css|js|png|jpe?g|gif|svg|woff2?|ico|webp|pdf|mp4)$/.test(seg)) continue;
    // Readable slugs use hyphens between words; token blobs do not.
    if (seg.includes('-') && seg.split('-').every((w) => w.length <= 12)) continue;

    const { random } = looksGenerated(seg);
    const hexish = /^[0-9a-f]{24,}$/.test(seg);
    if (!random && !hexish) continue;

    return sig({
      id: 'generated_path_segment',
      title: 'Address contains a long random-looking code',
      detail: `The part of the address reading "${raw.slice(0, 24)}…" is a generated token. Phishing kits use these to serve a unique page to each target.`,
      tier: 'url',
      weight: 18,
    });
  }
  return null;
};


/**
 * An email address sitting in the URL.
 *
 * Phishing links are sent to a list, and the kit needs to know who clicked, so
 * the victim's own address is embedded in the link — `?email=you@work.com`. The
 * page then pre-fills the login form with it, which is what makes the page
 * convincing. Legitimate sites use opaque session tokens for this, not
 * plaintext addresses in a query string.
 */
export const emailInUrl: Rule = (e) => {
  const haystack = decodeURIComponent(e.query + e.path);
  const match = haystack.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  if (!match) return null;
  return sig({
    id: 'email_address_in_url',
    title: 'Your email address is built into this link',
    detail: `This address carries "${match[0]}" inside it, which means the link was made for one specific person. Phishing campaigns do this so the fake login page can pre-fill your address.`,
    tier: 'url',
    weight: 22,
  });
};

/**
 * A subdomain made of several hyphenated words — `request-review-business-for.
 * case-client.com`. The registrable domain is bought once and then an unlimited
 * number of persuasive-sounding subdomains are generated under it.
 */
export const hyphenatedSubdomain: Rule = (e) => {
  const { subdomains, registrableDomain, isIpLiteral } = parseHost(e.hostname);
  if (isIpLiteral || isTrustedName(registrableDomain)) return null;
  const worst = subdomains
    .map((label) => ({ label, hyphens: (label.match(/-/g) ?? []).length }))
    .sort((a, b) => b.hyphens - a.hyphens)[0];
  if (!worst || worst.hyphens < 2) return null;
  return sig({
    id: 'hyphenated_subdomain',
    title: 'Hostname is a sentence made of hyphens',
    detail: `"${worst.label}" reads like a phrase rather than a name. Whoever owns ${registrableDomain} can create any number of these, and they cost nothing.`,
    tier: 'url',
    weight: 14,
  });
};


/**
 * The brand name is the domain — just not the brand's domain.
 *
 * `netflix.support`, `paypal.live`, `commbank.top`: an exact brand name
 * registered under a generic TLD that brand does not use. This is not a typo
 * and not a lookalike, so neither of those rules catches it.
 *
 * The rule deliberately ignores country-code TLDs. `google.si`, `ebay.es` and
 * `dhl.de` are all real: a global brand almost always runs its own country
 * sites, so a brand name under a two-letter ccTLD is weak evidence at best.
 * Under `.support` or `.top` it is not weak at all — no brand runs those, and
 * anyone can buy one for a few dollars.
 */
export const brandOnForeignTld: Rule = (e) => {
  const { registrableDomain, sld, suffix, isIpLiteral } = parseHost(e.hostname);
  if (isIpLiteral || !sld) return null;
  if (isTrustedName(registrableDomain)) return null;

  // Skip country-code suffixes entirely — see the note above.
  const lastLabel = suffix.split('.').pop() ?? '';
  if (lastLabel.length <= 2) return null;

  const legit = domainsForToken(sld);
  if (legit.length === 0 || legit.includes(registrableDomain)) return null;

  return sig({
    id: 'brand_on_foreign_tld',
    title: `"${sld}" registered under a domain that brand does not use`,
    detail: `The real ${sld} is at ${legit.slice(0, 2).join(' or ')}. ${registrableDomain} is a different registration that anyone could have bought.`,
    tier: 'url',
    weight: 28,
  });
};

export const URL_RULES: Rule[] = [
  ipLiteralHost,
  homographHost,
  confusableCharacters,
  brandTyposquat,
  brandOnForeignTld,
  brandOutsideRegistrable,
  embeddedCredentials,
  noHttps,
  highAbuseTld,
  deepSubdomains,
  trustWordsInHost,
  noisyDomain,
  urlShortener,
  riskyDownloadPath,
  excessiveUrlLength,
  compromisedCmsPath,
  freeHostingSubdomain,
  generatedDomainLabel,
  generatedPathSegment,
  emailInUrl,
  hyphenatedSubdomain,
];
