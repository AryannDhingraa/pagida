/**
 * The tokenizer must match scripts/train-text-models.py exactly. These
 * expected values were produced by the Python implementation; if either side
 * changes, this fails instead of the models quietly scoring the wrong words.
 */
import { describe, expect, it } from 'vitest';
import { buckets, terms } from '../src/learned/tokenize.js';
import { score } from '../src/learned/textModel.js';
import { EMAIL_MODEL } from '../src/learned/data/emailModel.js';
import { PAGE_MODEL } from '../src/learned/data/pageModel.js';

const CASES: Array<[string, string[], number[], number]> = [
  ['Your PayPal account has been LIMITED. Verify at https://paypa1-secure.top/login within 24 hours!',
    ['your', 'paypal', 'account', 'has', 'been', 'limited', 'verify', 'at'], [1038, 10704, 59050, 64218, 71048], 23],
  ['Hi Sam, lunch on Friday at 12:30? Email me at sam.lee@example.com',
    ['hi', 'sam', 'lunch', 'on', 'friday', 'at', 'numtoken', 'numtoken'], [1996, 12240, 15263, 33238, 40412], 21],
  ['Ünïcode café — naïve résumé',
    ['code', 'caf', 'na', 've', 'sum', 'code_caf', 'caf_na', 'na_ve'], [17917, 62172, 93428, 118468, 146088], 9],
];

describe('tokenizer parity with the training script', () => {
  it.each(CASES)('%s', (text, first, firstBuckets, count) => {
    expect(terms(text).slice(0, 8)).toEqual(first);
    const b = [...buckets(text)].sort((x, y) => x - y);
    expect(b.slice(0, 5)).toEqual(firstBuckets);
    expect(b.length).toBe(count);
  });
});

describe('the shipped models', () => {
  it('score an obvious phishing email high and an ordinary one low', () => {
    const phish = 'Your account has been suspended. Verify your identity within 24 hours by clicking the link below or your account will be permanently closed. Click here to confirm your password.';
    const ham = 'Hi team, attaching the minutes from Tuesday. Can everyone review the action items before next week and let me know if I missed anything from the budget discussion? Thanks, Priya';
    expect(score(EMAIL_MODEL, phish)!).toBeGreaterThan(0.8);
    expect(score(EMAIL_MODEL, ham)!).toBeLessThan(0.5);
  });
  it('stay silent on text too short to judge', () => {
    expect(score(PAGE_MODEL, 'Sign in')).toBeNull();
  });
});
