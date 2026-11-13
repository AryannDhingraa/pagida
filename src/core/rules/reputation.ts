/**
 * Tier 3: reputation rules.
 *
 * Two different kinds of thing live in here and the difference matters. Domain
 * age is an inference: young domains correlate with phishing, and plenty of
 * innocent sites are young. A blocklist entry is a report: an organisation
 * looked at this exact URL and classified it. The latter carry
 * `certainty: 'confirmed'`, which exempts them from the sensitivity multiplier
 * and from being suppressed by a user's "mark as safe".
 *
 * These depend on a network lookup having happened. Each one is optional and
 * each degrades to "no signal" rather than to an error, so the engine keeps
 * working with no keys, no network, and no consent to look anything up.
 */
import type { Rule, Signal } from '../types.js';
import { asksForSecret } from '../identity.js';
import { parseHost } from '../util/domain.js';
import { freeHostOf } from '../util/entropy.js';

const sig = (s: Signal): Signal => s;

/**
 * Domain age is the single strongest free signal in phishing detection.
 * Phishing infrastructure is disposable; the median phishing domain is days old.
 */
export const newlyRegisteredDomain: Rule = (e) => {
  const age = e.domainAgeDays;
  if (age === undefined || age === null) return null;
  if (age > 90) return null;
  // A 1-3 month old domain matters most when it is asking for something, so a
  // quiet page gets half the weight there. Under a month keeps full weight:
  // phishing landing pages often ask for nothing on the first screen.
  const quiet = e.dom !== undefined && !asksForSecret(e) && (e.dom.brandTokens?.length ?? 0) === 0;
  const scale = (w: number) => (quiet ? Math.round(w / 2) : w);

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
    weight: scale(12),
  });
};

/** Established domains earn a small credit: this is the one negative weight. */
export const establishedDomain: Rule = (e) => {
  const age = e.domainAgeDays;
  if (age === undefined || age === null) return null;
  if (age < 730) return null;
  // On a free host the age is the platform's, not the page owner's.
  const { suffix, registrableDomain } = parseHost(e.hostname);
  if (freeHostOf(e.hostname, suffix, registrableDomain)) return null;
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
    // Not a judgement Pagida made. Someone looked at this exact thing and
    // classified it, which is why a user's trust mark cannot silence it.
    certainty: 'confirmed',
  });
};

/** Hostname match: broader, so weighted lower than an exact URL match. */
export const feedHostMatch: Rule = (e) => {
  if (!e.feedHostHit || e.feedUrlHit) return null;
  return sig({
    id: 'phishing_feed_host_match',
    title: 'This site hosts known phishing pages',
    detail: 'Another page on this same host appears in the OpenPhish community feed of confirmed phishing pages.',
    tier: 'reputation',
    weight: 55,
    // Not a judgement Pagida made. Someone looked at this exact thing and
    // classified it, which is why a user's trust mark cannot silence it.
    certainty: 'confirmed',
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
    // Not a judgement Pagida made. Someone looked at this exact thing and
    // classified it, which is why a user's trust mark cannot silence it.
    certainty: 'confirmed',
  });
};

/**
 * Google Web Risk, via the Pagida service.
 *
 * Weighted just under Safe Browsing's own rule for the plain reason that this
 * lookup is domain-level: Web Risk was asked about the site, not the exact
 * page. That is still a very strong signal: Google does not list a domain on
 * a hunch, but a compromised subpage of a large host is the case where a
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
    // Not a judgement Pagida made. Someone looked at this exact thing and
    // classified it, which is why a user's trust mark cannot silence it.
    certainty: 'confirmed',
  });
};

const THREAT_WORDS: Record<string, string> = {
  MALWARE: 'a site that installs malware',
  SOCIAL_ENGINEERING: 'a phishing or scam site',
  UNWANTED_SOFTWARE: 'a site that pushes unwanted software',
};

/**
 * The big local list. Community-maintained and not perfect (it once listed
 * Netflix's video servers), so it is `correlated`, not `confirmed`: strong,
 * but a person's own "this is safe" can still overrule it.
 */
export const blocklistMatch: Rule = (e) => {
  if (!e.blocklistHit || e.feedUrlHit || e.feedHostHit) return null;
  return sig({
    id: 'local_blocklist_match',
    title: 'On a public list of phishing sites',
    detail: 'This domain is on Phishing.Database, a public list of active phishing sites that Pagida keeps on your computer and checks without sending anything anywhere.',
    tier: 'reputation',
    weight: 50,
    certainty: 'correlated',
  });
};

export const REPUTATION_RULES: Rule[] = [
  blocklistMatch,
  newlyRegisteredDomain,
  establishedDomain,
  feedUrlMatch,
  feedHostMatch,
  safeBrowsingMatch,
  webRiskMatch,
];
