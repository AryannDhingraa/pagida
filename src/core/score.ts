/**
 * Scoring: turns a set of fired signals into a number, a band and a verdict.
 *
 * Design notes worth defending in an interview:
 *  - Weights are additive and capped, not multiplied. Additive is explainable:
 *    every point on screen traces back to exactly one named signal.
 *  - The score is capped at 100 *after* summing, so stacking many weak signals
 *    can reach the top band, but a single strong one can too.
 *  - User overrides bypass the score entirely. If someone has told the tool a
 *    site is safe, arguing with them is how a security tool gets uninstalled.
 *  - The sensitivity setting scales heuristic weights only. A confirmed
 *    blocklist match is a fact, not a judgement call, so it is never tuned down.
 */
import type { Band, PageEvidence, Rule, Signal, Verdict } from './types.js';
import { ALL_RULES } from './rules/index.js';

/**
 * Band boundaries, chosen from the evaluation curve rather than from round
 * numbers. See EVALUATION.md: on address evidence alone the engine separates
 * confirmed phishing from legitimate sites cleanly around 15-35, and the top
 * band is set high enough that it is effectively unreachable without either
 * page-content evidence or a blocklist match — which is deliberate, because the
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

  // --- user overrides win outright ---
  if (e.userTrusted) {
    return {
      ...base,
      score: 0,
      band: 'clean',
      override: 'trusted',
      signals: [{
        id: 'user_marked_safe',
        title: 'You marked this site as safe',
        detail: 'Pagida is not scoring this site because you told it not to. You can undo this in Options.',
        tier: 'user',
        weight: 0,
      }],
    };
  }

  if (e.userReported) {
    return {
      ...base,
      score: 100,
      band: 'danger',
      override: 'reported',
      signals: [{
        id: 'user_reported_phishing',
        title: 'You reported this site as phishing',
        detail: 'You flagged this site yourself. Pagida will keep warning you until you remove it in Options.',
        tier: 'user',
        weight: 100,
      }],
    };
  }

  // --- normal path ---
  const signals: Signal[] = [];
  for (const rule of rules) {
    const s = rule(e);
    if (!s) continue;
    // Heuristics respond to the sensitivity setting; confirmed intelligence does not.
    const tunable = s.tier === 'url' || s.tier === 'dom';
    signals.push(tunable ? { ...s, weight: Math.round(s.weight * multiplier) } : s);
  }

  signals.sort((a, b) => b.weight - a.weight);
  const raw = signals.reduce((sum, s) => sum + s.weight, 0);
  const score = Math.max(0, Math.min(100, raw));

  return { ...base, score, band: bandFor(score), signals };
}

/** Human-readable one-liner for the banner and the badge tooltip. */
export function summarise(v: Verdict): string {
  if (v.override === 'trusted') return 'You marked this site as safe.';
  if (v.override === 'reported') return 'You reported this site as phishing.';
  const n = v.signals.filter((s) => s.weight > 0).length;
  if (n === 0) return 'Nothing suspicious found.';
  return `${n} warning sign${n === 1 ? '' : 's'} found on this page.`;
}
