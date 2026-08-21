import { describe, expect, it } from 'vitest';
import { hasConfusables, isMixedScript, isPunycode, skeleton } from '../src/core/util/homograph.js';

describe('homograph detection', () => {
  it('spots punycode labels', () => {
    expect(isPunycode('xn--80ak6aa92e')).toBe(true);
    expect(isPunycode('paypal')).toBe(false);
  });

  it('spots a Latin hostname with Cyrillic characters hidden in it', () => {
    // The first character here is Cyrillic U+0430, not Latin 'a'.
    expect(isMixedScript('аpple.com')).toBe(true);
  });

  it('does not flag a hostname that is entirely one alphabet', () => {
    expect(isMixedScript('apple.com')).toBe(false);
  });

  it('folds confusable characters down to ASCII', () => {
    expect(skeleton('pаypal')).toBe('paypal');
    expect(skeleton('paypa1')).toBe('paypal');
    expect(skeleton('g00gle')).toBe('google');
  });

  it('reports when folding actually changed something', () => {
    expect(hasConfusables('pаypal')).toBe(true);
    expect(hasConfusables('paypal')).toBe(false);
  });
});
