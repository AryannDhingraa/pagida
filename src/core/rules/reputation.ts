/**
 * Tier 3 — reputation rules.
 *
 * These depend on a network lookup having happened. Each one is optional and
 * each degrades to "no signal" rather than to an error, so the engine keeps
 * working with no keys, no network, and no consent to look anything up.
 */
import type { Rule, Signal } from '../types.js';

const sig = (s: Signal): Signal => s;

/**
 * Domain age is the single strongest free signal in phishing detection.
 * Phishing infrastructure is disposable; the median phishing domain is days old.
 */
export const newlyRegisteredDomain: Rule = (e) => {
  const age = e.domainAgeDays;
  if (age === undefined || age === null) return null;
  if (age > 90) return null;

  if (age <= 7) {
    return sig({
      id: 'domain_age_lt_7d',
      title: `Domain registered ${age} day${age === 1 ? '' : 's'} ago`,
      detail: 'Almost all phishing sites run on brand-new domains. A week-old domain asking for a login is a serious warning.',
      tier: 'reputation',
      weight: 30,
    });
  }
  if (age <= 30) {
    return sig({
      id: 'domain_age_lt_30d',
      title: `Domain registered ${age} days ago`,
      detail: 'This domain is less than a month old. Established services have had theirs for years.',
      tier: 'reputation',
      weight: 25,
    });
  }
  return sig({
    id: 'domain_age_lt_90d',
    title: `Domain registered ${age} days ago`,
    detail: 'This domain is fairly new. Not unusual on its own, but worth knowing.',
    tier: 'reputation',
    weight: 12,
  });
};

/** Established domains earn a small credit — this is the one negative weight. */
export const establishedDomain: Rule = (e) => {
  const age = e.domainAgeDays;
  if (age === undefined || age === null) return null;
  if (age < 730) return null;
  return sig({
    id: 'domain_well_established',
    title: `Domain has existed for ${Math.floor(age / 365)} years`,
    detail: 'Long-lived domains are rarely used for phishing, because they are expensive to burn.',
    tier: 'reputation',
    weight: -10,
  });
};

/** Exact URL match in a community phishing feed. */
export const feedUrlMatch: Rule = (e) => {
  if (!e.feedUrlHit) return null;
  return sig({
    id: 'phishing_feed_url_match',
    title: 'This exact page is on a phishing blocklist',
    detail: 'This URL appears in the OpenPhish community feed of confirmed phishing pages.',
    tier: 'reputation',
    weight: 80,
  });
};

/** Hostname match — broader, so weighted lower than an exact URL match. */
export const feedHostMatch: Rule = (e) => {
  if (!e.feedHostHit || e.feedUrlHit) return null;
  return sig({
    id: 'phishing_feed_host_match',
    title: 'This site hosts known phishing pages',
    detail: 'Another page on this same host appears in the OpenPhish community feed of confirmed phishing pages.',
    tier: 'reputation',
    weight: 55,
  });
};

/** Google Safe Browsing threat match (only when the user supplied a key). */
export const safeBrowsingMatch: Rule = (e) => {
  if (!e.safeBrowsingHit) return null;
  return sig({
    id: 'safe_browsing_match',
    title: 'Google Safe Browsing flags this site',
    detail: 'Google classifies this address as social engineering, malware or unwanted software.',
    tier: 'reputation',
    weight: 85,
  });
};

/**
 * Google Web Risk, via the Pagida service.
 *
 * Weighted just under Safe Browsing's own rule for the plain reason that this
 * lookup is domain-level: Web Risk was asked about the site, not the exact
 * page. That is still a very strong signal — Google does not list a domain on
 * a hunch — but a compromised subpage of a large host is the case where a
 * URL-level answer would be sharper.
 */
export const webRiskMatch: Rule = (e) => {
  if (!e.webRiskHit) return null;
  const kinds = (e.webRiskThreats ?? []).map((t) => THREAT_WORDS[t] ?? t.toLowerCase()).filter(Boolean);
  const what = kinds.length ? kinds.join(' and ') : 'a known threat';
  return sig({
    id: 'web_risk_match',
    title: 'On Google\u2019s list of dangerous sites',
    detail: `Google has this domain recorded as ${what}. This is not a guess about how the page looks \u2014 it is a positive identification.`,
    tier: 'reputation',
    weight: 80,
  });
};

const THREAT_WORDS: Record<string, string> = {
  MALWARE: 'a site that installs malware',
  SOCIAL_ENGINEERING: 'a phishing or scam site',
  UNWANTED_SOFTWARE: 'a site that pushes unwanted software',
};

export const REPUTATION_RULES: Rule[] = [
  newlyRegisteredDomain,
  establishedDomain,
  feedUrlMatch,
  feedHostMatch,
  safeBrowsingMatch,
  webRiskMatch,
];
