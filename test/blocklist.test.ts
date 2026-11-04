import { describe, expect, it } from 'vitest';
import { buildIndex, contains, listed } from '../src/services/blocklist.js';
import { brandsForHash } from '../src/services/logo.js';
import { dhashFromRgba, hamming, informative } from '../src/core/util/dhash.js';

const LIST = [
  '# Phishing.Database sample',
  'secure-login-paypa1.com',
  'www.verify-commbank-au.top',
  'amazon.ie',
  'nflxvideo.net',
  'evil.pages.dev',
  'docs.google.com',
].join('\n');

describe('local blocklist', () => {
  const index = buildIndex(LIST);
  it('finds listed domains and their subdomains', () => {
    expect(contains(index, 'secure-login-paypa1.com')).toBe(true);
    expect(listed(index, 'secure-login-paypa1.com')).toBe(true);
    expect(listed(index, 'auth.secure-login-paypa1.com')).toBe(true);
    expect(listed(index, 'verify-commbank-au.top')).toBe(true);
  });
  it('never accuses a brand, a top site or a whole shared platform', () => {
    expect(listed(index, 'amazon.ie')).toBe(false);
    expect(listed(index, 'nflxvideo.net')).toBe(false);
    expect(listed(index, 'docs.google.com')).toBe(false);
  });
  it('a listed tenant on a shared platform is listed, its neighbours are not', () => {
    expect(listed(index, 'evil.pages.dev')).toBe(true);
    expect(listed(index, 'my-portfolio.pages.dev')).toBe(false);
  });
  it('is not fooled by near misses', () => {
    expect(listed(index, 'secure-login-paypal.com')).toBe(false);
  });
});

describe('image fingerprints', () => {
  const solid = new Array(72 * 4).fill(255);
  it('a blank icon carries no identity', () => {
    expect(informative(dhashFromRgba(solid))).toBe(false);
    expect(brandsForHash('0000000000000000')).toEqual([]);
  });
  it('hamming distance counts differing bits', () => {
    expect(hamming('ff00000000000000', 'fe00000000000000')).toBe(1);
  });
});
