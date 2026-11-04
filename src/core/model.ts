/**
 * A small trained model on top of the hand-written rules.
 *
 * Hand-picked weights were the engine's weakest part: nobody can tune 50
 * numbers by intuition. This is a logistic regression over which heuristic
 * signals fired (plus a few page facts), trained on pages the test harness
 * actually visited: legitimate sites from the Tranco list and live phishing
 * pages from Phishing.Database. Its weights live in data/model.ts and are a
 * few hundred bytes.
 *
 * What it is allowed to do is deliberately narrow:
 *  - It adds one signal, `model_assessment`, worth between -12 and +18 points.
 *  - It never creates or removes a conclusion, so on its own it can never
 *    reach "Likely phishing" or make Iris pop up.
 *  - It ignores blocklist and Google matches: those are facts, not features.
 * So the worst a bad model can do is move a heuristic-only page by one band
 * inside the caps in score.ts.
 */
import type { PageEvidence, Signal } from './types.js';
import { MODEL } from './data/model.js';

export interface ModelWeights {
  /** Feature names, in order. Signal ids, or `page:*` facts. */
  features: string[];
  weights: number[];
  bias: number;
  /** Where the numbers came from, shown in the report. */
  trainedOn: string;
}

const NOT_FEATURES = new Set([
  'phishing_feed_url_match', 'phishing_feed_host_match', 'safe_browsing_match', 'web_risk_match',
  'local_blocklist_match', 'model_assessment',
]);

export function featureVector(e: PageEvidence, signals: Signal[], model: ModelWeights = MODEL): number[] {
  const fired = new Set(signals.filter((s) => !NOT_FEATURES.has(s.id) && s.weight !== 0).map((s) => s.id));
  const d = e.dom;
  const facts: Record<string, boolean> = {
    'page:password': !!d?.hasPasswordField,
    'page:https': e.protocol === 'https:',
    'page:no-dom': !d,
    'page:few-links': !!d && d.linkCount < 5,
  };
  return model.features.map((f) => (f.startsWith('page:') ? (facts[f] ? 1 : 0) : (fired.has(f) ? 1 : 0)));
}

export function probability(e: PageEvidence, signals: Signal[], model: ModelWeights = MODEL): number {
  const x = featureVector(e, signals, model);
  let z = model.bias;
  for (let i = 0; i < x.length; i++) z += x[i]! * (model.weights[i] ?? 0);
  return 1 / (1 + Math.exp(-z));
}

/** The one signal the model contributes. Null when it has nothing to say. */
export function modelSignal(e: PageEvidence, signals: Signal[], model: ModelWeights = MODEL): Signal | null {
  if (model.features.length === 0) return null;
  // On a page with no heuristic evidence at all the model only restates its prior.
  if (!signals.some((s) => s.weight > 0 && !NOT_FEATURES.has(s.id))) return null;
  const p = probability(e, signals, model);
  const weight = Math.max(-12, Math.min(18, Math.round((p - 0.5) * 36)));
  if (Math.abs(weight) < 3) return null;
  const pct = Math.round(p * 100);
  return {
    id: 'model_assessment',
    title: weight > 0 ? 'These signs together look like phishing' : 'These signs together look harmless',
    detail: `Pagida's trained model puts pages with this combination of signs at about ${pct}% phishing, based on ${model.trainedOn}. It adjusts the score; it never decides on its own.`,
    tier: 'dom',
    weight,
  };
}
