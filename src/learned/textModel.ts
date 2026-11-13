/**
 * Scoring with a trained text model: logistic regression over hashed words
 * and word pairs. Both models (emails, web pages) are this shape, generated
 * by `scripts/train-text-models.py` into `src/learned/data/`.
 *
 * Runs where the text is (the content script), so the words of an email or a
 * page never travel anywhere, not even to Pagida's own service worker: only
 * the resulting number does.
 */
import { buckets } from './tokenize.js';

export interface TextModel {
  /** What it is for, for the report: "emails" or "web pages". */
  kind: string;
  bias: number;
  /** Bucket index -> weight. Only the strongest weights are kept. */
  weights: Record<string, number>;
  /** Where the numbers came from, in words. */
  trainedOn: string;
  /** Held-out results, in words. */
  tested: string;
}

/** Probability (0..1) that the text is phishing, or null when the model is empty. */
export function score(model: TextModel, text: string): number | null {
  if (Object.keys(model.weights).length === 0 || text.trim().length < 40) return null;
  let z = model.bias;
  for (const b of buckets(text)) {
    const w = model.weights[b];
    if (w !== undefined) z += w;
  }
  return 1 / (1 + Math.exp(-z));
}
