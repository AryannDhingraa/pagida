/**
 * Scoring: turns a set of fired signals into a number, a band and a verdict.
 *
 * Design notes worth defending in an interview:
 *  - Weights are additive and capped, not multiplied. Additive is explainable:
 *    every point on screen traces back to exactly one named signal.
 *  - The score is capped at 100 *after* summing, so stacking many weak signals
 *    can reach the top band, but a single strong one can too.
 *  - A user's "mark as safe" suppresses heuristics, and only heuristics. It
 *    cannot silence a confirmed threat-intelligence match. The original design
 *    let it silence everything, on the reasoning that arguing with the user is
 *    how a security tool gets uninstalled. That reasoning is right about
 *    heuristics and wrong about facts: a domain the user trusted last year and
 *    that is on a phishing blocklist today is exactly the case the tool exists
 *    for, and staying quiet there is the worst thing it could do.
 *  - The band is not decided by the sum alone. Conclusions (see conclusions.ts)
 *    can impose a floor, so a real attack reaches the top band because of its
 *    shape rather than because enough weak rules stacked up.
 *  - The sensitivity setting scales heuristic weights only. A confirmed
 *    blocklist match is a fact, not a judgement call, so it is never tuned down.
 */
import type { Band, Confidence, Conclusion, PageEvidence, Rule, Signal, Verdict } from './types.js';
import { ALL_RULES } from './rules/index.js';
import { concludeFrom, floorFrom, higherBand, bandRank } from './conclusions.js';
import { isPrivateHost } from './util/network.js';
import { parseHost } from './util/domain.js';
import { BRAND_DOMAINS, isOfficialDomain, isWellKnown } from './data/index.js';

export { BAND_ADVICE, BAND_HEADLINE, BAND_NAME, CONFIDENCE_NOTE, adviceFor, headlineFor } from './wording.js';

/**
 * Band boundaries, chosen from the evaluation curve rather than from round
 * numbers. See EVALUATION.md: on address evidence alone the engine separates
 * confirmed phishing from legitimate sites cleanly around 15-35, and the top
 * band is set high enough that it is effectively unreachable without either
 * page-content evidence or a blocklist match, which is deliberate, because the
 * top band is the only one that interrupts the user.
 */
export const BAND_THRESHOLDS = {
  caution: 15,
  suspicious: 30,
  danger: 55,
} as const;

export function bandFor(score: number): Band {
  if (score >= BAND_THRESHOLDS.danger) return 'danger';
  if (score >= BAND_THRESHOLDS.suspicious) return 'suspicious';
  if (score >= BAND_THRESHOLDS.caution) return 'caution';
  return 'clean';
}

export const BAND_LABELS: Record<Band, string> = {
  clean: 'NO_ISSUES_FOUND',
  caution: 'WORTH_A_LOOK',
  suspicious: 'SUSPICIOUS',
  danger: 'LIKELY_PHISHING',
};

/** Sensitivity shifts every weight up or down before banding. */
export type Sensitivity = 'relaxed' | 'balanced' | 'strict';
const SENSITIVITY_MULTIPLIER: Record<Sensitivity, number> = {
  relaxed: 0.8,
  balanced: 1,
  strict: 1.25,
};

export interface EvaluateOptions {
  rules?: Rule[];
  sensitivity?: Sensitivity;
}

export function evaluate(e: PageEvidence, opts: EvaluateOptions = {}): Verdict {
  const rules = opts.rules ?? ALL_RULES;
  const multiplier = SENSITIVITY_MULTIPLIER[opts.sensitivity ?? 'balanced'];
  const base = {
    url: e.url,
    hostname: e.hostname,
    urlOnly: e.dom === undefined,
    evaluatedAt: Date.now(),
  };

  // The user reporting a site themselves is the one input that needs no
  // corroboration. They are describing their own experience of it.
  if (e.userReported) {
    return {
      ...base,
      score: 100,
      band: 'danger',
      override: 'reported',
      conclusions: [],
      confidence: 'confirmed',
      signals: [{
        id: 'user_reported_phishing',
        title: 'You reported this site as phishing',
        detail: 'You flagged this site yourself. Pagida will keep warning you until you remove it in Options.',
        tier: 'user',
        weight: 100,
        certainty: 'confirmed',
      }],
    };
  }

  // --- the user's own network ---
  if (isPrivateHost(e.hostname)) {
    return {
      ...base,
      score: 0,
      band: 'clean',
      conclusions: [],
      confidence: 'medium',
      signals: [{
        id: 'private_network_host',
        title: 'This is on your own network or computer',
        detail: `${e.hostname} is a local address, like a router, a home server or a development site. Scams reach people from the public internet, so Pagida does not score these and never looks them up anywhere.`,
        tier: 'url',
        weight: 0,
      }],
    };
  }

  // --- run every rule ---
  const signals: Signal[] = [];
  for (const rule of rules) {
    const s = rule(e);
    if (!s) continue;
    // Heuristics respond to the sensitivity setting; confirmed intelligence does
    // not, because it is not a judgement that can be dialled up or down.
    const tunable = (s.tier === 'url' || s.tier === 'dom') && s.certainty !== 'confirmed';
    signals.push(tunable ? { ...s, weight: Math.round(s.weight * multiplier) } : s);
  }
  signals.sort((a, b) => b.weight - a.weight);

  const conclusions = concludeFrom(e, signals);

  // --- the user marked this site safe ---
  //
  // Their call stands against anything Pagida merely inferred. It does not
  // stand against something an outside source positively identified.
  if (e.userTrusted) {
    const confirmed = signals.filter((s) => s.certainty === 'confirmed' && s.weight > 0);

    if (confirmed.length === 0) {
      return {
        ...base,
        score: 0,
        band: 'clean',
        override: 'trusted',
        conclusions: [],
        confidence: 'medium',
        signals: [{
          id: 'user_marked_safe',
          title: 'You marked this site as safe',
          detail: 'Pagida is not applying its own guesswork here because you told it not to. It will still speak up if this site turns up on a confirmed threat list. You can undo this in Options.',
          tier: 'user',
          weight: 0,
        }],
      };
    }

    // A site the user trusted can be compromised later. This is that moment.
    const overruling = concludeFrom(e, confirmed);
    return {
      ...base,
      score: Math.min(100, confirmed.reduce((sum, s) => sum + s.weight, 0)),
      band: 'danger',
      override: 'overruled',
      conclusions: overruling,
      confidence: 'confirmed',
      signals: [
        ...confirmed,
        {
          id: 'trust_overruled',
          title: 'You marked this site safe, and I am warning you anyway',
          detail: 'You trusted this site before, so Pagida has been staying quiet about it. It is now on a list of confirmed attacks, which usually means it has been compromised since. This is the one thing your mark does not silence.',
          tier: 'user',
          weight: 0,
        },
      ],
    };
  }

  // --- normal path: the sum proposes, the conclusions dispose ---
  const raw = signals.reduce((sum, s) => sum + s.weight, 0);
  const score = Math.max(0, Math.min(100, raw));
  const band = higherBand(capHeuristics(bandFor(score), e, signals, conclusions), floorFrom(conclusions));

  return {
    ...base,
    score,
    band,
    conclusions,
    confidence: confidenceFrom(signals, conclusions, band),
    signals,
  };
}

/**
 * A pile of cosmetic observations is not a verdict.
 *
 * v3 let the sum alone reach `danger`, the band that says "do not type your
 * password here". Without a conclusion or a confirmed match, heuristics now
 * stop at `suspicious`, and on a domain that has existed for two years they
 * stop at `caution`: an old domain with an odd-looking address is a quirk,
 * not an attack, until the page itself does something an attack does.
 */
const ADDRESS_IMPERSONATION = new Set([
  'brand_in_subdomain', 'brand_in_domain_name', 'brand_typosquat', 'brand_confusable_domain', 'brand_on_foreign_tld', 'mixed_script_hostname',
]);

export function capHeuristics(band: Band, e: PageEvidence, signals: Signal[], conclusions: Conclusion[]): Band {
  if (conclusions.length > 0) return band;
  if (signals.some((s) => s.certainty === 'confirmed' && s.weight > 0)) return band;
  // The address itself impersonating a brand is not cosmetic: that is the
  // attack, written where everyone can read it.
  if (signals.some((s) => ADDRESS_IMPERSONATION.has(s.id))) return band;
  // Old domains are softened, except where the address shows the site has
  // been broken into: phishing kits live on old, hacked WordPress sites.
  const compromised = signals.some((s) => s.id === 'wordpress_internal_path' || s.id === 'wordpress_upload_path');
  // Top sites, brands' own domains and official domains (gov.in, gov.au) are
  // never judged by guesswork alone, however new the page or the domain.
  const here = parseHost(e.hostname).registrableDomain;
  // A site this person has used on many days, with no warning ever, counts as known to them.
  const known = isWellKnown(here) || BRAND_DOMAINS.has(here) || isOfficialDomain(here) || !!e.history?.trusted;
  const ceiling: Band = ((e.domainAgeDays ?? 0) >= 730 || known) && !compromised ? 'caution' : 'suspicious';
  return bandRank(band) > bandRank(ceiling) ? ceiling : band;
}

/**
 * How much the engine should be believed, which is a different question from
 * how high the score is.
 *
 * A page can reach `suspicious` on six cosmetic observations and be completely
 * innocent; another reaches it on one blocklist entry and is certainly not.
 * Reporting both as "score 34" tells the user nothing about which is which, so
 * the UI reports this instead and leaves the number to the report tab.
 */
export function confidenceFrom(
  signals: Signal[],
  conclusions: Conclusion[],
  band: Band,
): Confidence {
  if (signals.some((s) => s.certainty === 'confirmed' && s.weight > 0)) return 'confirmed';
  if (conclusions.some((c) => c.floor === 'danger')) return 'high';
  if (conclusions.length > 0) return 'medium';
  if (band === 'clean') return 'medium';

  // Nothing but heuristics. Several independent ones are worth more than one,
  // but none of this is evidence in the way a positive identification is.
  const distinctTiers = new Set(signals.filter((s) => s.weight > 0).map((s) => s.tier)).size;
  return distinctTiers >= 2 ? 'medium' : 'low';
}

/** Human-readable one-liner for the banner and the badge tooltip. */
export function summarise(v: Verdict): string {
  if (v.override === 'overruled') return 'You marked this safe, but it is on a confirmed threat list.';
  if (v.override === 'trusted') return 'You marked this site as safe.';
  if (v.override === 'reported') return 'You reported this site as phishing.';
  if (v.conclusions[0]) return v.conclusions[0].title;
  const n = v.signals.filter((s) => s.weight > 0).length;
  if (n === 0) return 'Nothing suspicious found.';
  return `${n} warning sign${n === 1 ? '' : 's'} found on this page.`;
}

