/**
 * What Pagida says, in words: band names, headlines and advice.
 *
 * Kept apart from the scoring so the page script can show a verdict without
 * bundling the whole engine (the allowlist alone is 150 KB).
 */
import type { Band, Confidence, Verdict } from './types.js';

// ---------------------------------------------------------------------------
// Plain English.
//
// The score is for people who want it. The sentence is for everyone else, and
// it is the only thing most people will ever read, so it says what to do rather
// than what was found.
// ---------------------------------------------------------------------------

export const BAND_HEADLINE: Record<Band, string> = {
  clean: 'This page looks fine.',
  caution: 'A couple of things worth knowing.',
  suspicious: 'Be careful with this one.',
  danger: 'Do not type your password here.',
};

export const BAND_ADVICE: Record<Band, string> = {
  clean: 'Nothing here looks like a scam.',
  caution: 'Nothing alarming, but have a look at what I found before signing in.',
  suspicious: 'Several things do not add up. Do not enter a password or card number.',
  danger: 'This page is almost certainly pretending to be someone else. Close it.',
};

/** Short label for the toolbar tooltip and the report header. */
export const BAND_NAME: Record<Band, string> = {
  clean: 'Nothing found',
  caution: 'Worth a look',
  suspicious: 'Suspicious',
  danger: 'Likely phishing',
};

/**
 * The headline Iris says. Overrides get their own wording, because "you told me
 * to trust this" is a different statement from "I checked and it is fine".
 */
export function headlineFor(verdict: Verdict): string {
  if (verdict.override === 'overruled') return 'I have to break my own rule here.';
  // A conclusion is a better headline than a band label, because it says what
  // is actually happening rather than how worried to be about it.
  if (verdict.conclusions[0]) return verdict.conclusions[0].title;
  if (verdict.override === 'trusted') return 'You told me this one is fine.';
  if (verdict.override === 'reported') return 'You reported this site.';
  if (verdict.band === 'clean' && verdict.urlOnly) return 'Nothing odd about this address.';
  return BAND_HEADLINE[verdict.band];
}

export function adviceFor(verdict: Verdict): string {
  if (verdict.override === 'overruled') {
    return 'You marked this site safe, so I stay quiet about anything I only suspect. This is not that — it is on a confirmed list of attacks, which usually means it has been broken into since you trusted it.';
  }
  if (verdict.conclusions[0]) return verdict.conclusions[0].detail;
  if (verdict.override === 'trusted') return 'I am not applying guesswork here. I will still warn you if it turns up on a confirmed threat list.';
  if (verdict.override === 'reported') return 'I will keep warning you about it until you undo that.';
  if (verdict.band === 'clean' && verdict.urlOnly) {
    return 'I could not read the page itself — reload it for the full check.';
  }
  return BAND_ADVICE[verdict.band];
}

/**
 * What the score is actually worth, in one line, under the number.
 *
 * The criticism this answers: a weighted sum presented beside "do not type your
 * password here" reads as a probability, and it is not one. 55 does not mean
 * "55% likely" — it means some rules fired and their weights added up. These
 * lines say where the answer came from, so the user can tell the difference
 * between six cosmetic observations and one positive identification.
 */
export const CONFIDENCE_NOTE: Record<Confidence, string> = {
  confirmed: 'Confirmed by a threat-intelligence source — not a guess.',
  high: 'Strong evidence: several independent things line up the way an attack does.',
  medium: 'Moderate evidence. Worth a look rather than an alarm.',
  low: 'Weak evidence — surface details only. Plenty of honest sites look like this.',
};
