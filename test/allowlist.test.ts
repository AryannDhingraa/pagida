import { describe, expect, it } from 'vitest';
import { ALLOWLIST_SIZE, isWellKnown } from '../src/core/data/allowlist.js';
import { evidenceFromUrl } from '../src/core/evidence.js';
import { evaluate } from '../src/core/score.js';
import { URL_RULES } from '../src/core/rules/url.js';

const ids = (url: string) =>
  evaluate(evidenceFromUrl(url)!, { rules: URL_RULES }).signals.map((s) => s.id);

describe('well-known domain allowlist', () => {
  it('is populated', () => {
    expect(ALLOWLIST_SIZE).toBeGreaterThan(500);
  });

  it('recognises top sites by registrable domain', () => {
    expect(isWellKnown('bbc.co.uk')).toBe(true);
    expect(isWellKnown('wikipedia.org')).toBe(true);
    expect(isWellKnown('paypal-secure-login.tk')).toBe(false);
  });

  it('suppresses lookalike rules for well-known sites', () => {
    // telegraph.co.uk sits two edits from "telegram" — the exact false positive
    // the allowlist exists to remove.
    expect(ids('https://telegraph.co.uk/')).not.toContain('brand_typosquat');
    expect(ids('https://mail.ru/')).not.toContain('brand_typosquat');
  });

  it('does NOT suppress behavioural rules for well-known sites', () => {
    // A compromised WordPress install on a well-known domain must still score.
    expect(ids('https://bbc.co.uk/wp-includes/vvs/login.html'))
      .toContain('wordpress_internal_path');
  });

  it('still flags a typosquat of a well-known-adjacent name', () => {
    expect(ids('https://paypa1.com/signin')).toContain('brand_confusable_domain');
  });
});
