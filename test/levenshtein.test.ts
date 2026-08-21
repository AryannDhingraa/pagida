import { describe, expect, it } from 'vitest';
import { editDistance } from '../src/core/util/levenshtein.js';

describe('editDistance', () => {
  it('is zero for identical strings', () => {
    expect(editDistance('paypal', 'paypal')).toBe(0);
  });
  it('counts a single substitution', () => {
    expect(editDistance('paypa1', 'paypal')).toBe(1);
  });
  it('counts a single deletion', () => {
    expect(editDistance('payal', 'paypal')).toBe(1);
  });
  it('counts an adjacent transposition as one edit', () => {
    expect(editDistance('gogole', 'google')).toBe(1);
  });
  it('handles empty strings', () => {
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('abc', '')).toBe(3);
  });
  it('bails out early past the max', () => {
    expect(editDistance('completely', 'different', 2)).toBeGreaterThan(2);
  });
});
