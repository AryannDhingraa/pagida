import { describe, expect, it } from 'vitest';
import { evidenceFromUrl } from '../src/core/evidence.js';
import { evaluate } from '../src/core/score.js';
import { URL_RULES } from '../src/core/rules/url.js';

/** Score a URL using only the URL tier — no page content, no network. */
function scoreUrl(url: string) {
  const e = evidenceFromUrl(url);
  if (!e) throw new Error(`not analysable: ${url}`);
  return evaluate(e, { rules: URL_RULES });
}

const firedIds = (url: string) => scoreUrl(url).signals.map((s) => s.id);

describe('URL tier — legitimate sites stay clean', () => {
  const legit = [
    'https://www.google.com/search?q=test',
    'https://github.com/AryanDhingraa',
    'https://www.commbank.com.au/personal.html',
    'https://my.gov.au/',
    'https://www.paypal.com/au/signin',
    'https://login.microsoftonline.com/common/oauth2/authorize',
    'https://www.rmit.edu.au/students',
    'https://auspost.com.au/mypost/track',
  ];
  for (const url of legit) {
    it(`scores ${new URL(url).hostname} in the clean band`, () => {
      const v = scoreUrl(url);
      expect(v.band, `${url} fired: ${v.signals.map((s) => s.id).join(', ')}`).toBe('clean');
    });
  }
});

describe('URL tier — phishing shapes are caught', () => {
  it('flags a raw IP host', () => {
    expect(firedIds('http://185.220.101.42/login')).toContain('host_is_ip_literal');
  });

  it('flags a digit-substitution typosquat', () => {
    expect(firedIds('https://paypa1.com/signin')).toContain('brand_confusable_domain');
  });

  it('flags a one-edit typosquat', () => {
    expect(firedIds('https://paypall.com/signin')).toContain('brand_typosquat');
    expect(firedIds('https://mail.ru/')).not.toContain('brand_typosquat');
  });

  it('flags a brand name pushed into the subdomain', () => {
    expect(firedIds('https://paypal.secure-billing.xyz/login'))
      .toContain('brand_in_subdomain');
  });

  it('flags credentials embedded in the address', () => {
    expect(firedIds('https://www.paypal.com@evil-host.tk/')).toContain('embedded_credentials_in_url');
  });

  it('flags plain http', () => {
    expect(firedIds('http://example-login-portal.tk/')).toContain('no_https');
  });

  it('flags a high-abuse TLD', () => {
    expect(firedIds('https://something.tk/')).toContain('free_registration_tld');
    expect(firedIds('https://something.buzz/')).toContain('high_abuse_tld');
  });

  it('flags deep subdomain nesting', () => {
    expect(firedIds('https://a.b.c.d.e.example-site.com/')).toContain('deep_subdomain_nesting');
  });

  it('flags trust words in the hostname', () => {
    expect(firedIds('https://secure-account-verify.com/')).toContain('trust_words_in_hostname');
  });

  it('flags machine-generated domain names', () => {
    expect(firedIds('https://a-b-c-d-1234.com/')).toContain('noisy_domain_name');
  });

  it('flags shortened links', () => {
    expect(firedIds('https://bit.ly/3xYz')).toContain('url_shortener');
  });

  it('flags an executable in the path', () => {
    expect(firedIds('https://files.example.com/invoice.exe')).toContain('risky_download_in_path');
  });

  it('puts a full phishing URL in the danger band', () => {
    const v = scoreUrl('http://paypal-secure-login.verify-account.tk/signin');
    expect(v.band).toBe('danger');
    expect(v.score).toBeGreaterThanOrEqual(75);
  });
});

describe('scoring behaviour', () => {
  it('caps the score at 100', () => {
    const v = scoreUrl('http://paypal.secure.login.verify.account.update.confirm-billing-1234.tk/invoice.exe');
    expect(v.score).toBeLessThanOrEqual(100);
  });

  it('orders signals by weight, heaviest first', () => {
    const v = scoreUrl('http://paypal-secure-login.verify-account.tk/signin');
    const weights = v.signals.map((s) => s.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
  });

  it('strict sensitivity scores higher than relaxed', () => {
    const e = evidenceFromUrl('https://secure-login-account.tk/')!;
    const strict = evaluate(e, { rules: URL_RULES, sensitivity: 'strict' });
    const relaxed = evaluate(e, { rules: URL_RULES, sensitivity: 'relaxed' });
    expect(strict.score).toBeGreaterThan(relaxed.score);
  });

  it('refuses to analyse browser-internal pages', () => {
    expect(evidenceFromUrl('chrome://extensions')).toBeNull();
    expect(evidenceFromUrl('about:blank')).toBeNull();
    expect(evidenceFromUrl('not a url at all')).toBeNull();
  });
});

describe('brand name on a foreign TLD', () => {
  it('flags an exact brand name under a generic TLD the brand does not use', () => {
    expect(firedIds('https://netflix.support/billing')).toContain('brand_on_foreign_tld');
    expect(firedIds('https://commbank.top/login')).toContain('brand_on_foreign_tld');
  });

  it('ignores country-code TLDs, where brands really do run their own sites', () => {
    // google.si, ebay.es and dhl.de are all genuine. A ccTLD is too weak a
    // signal to act on, so the rule deliberately does not look at them.
    expect(firedIds('https://google.si/')).not.toContain('brand_on_foreign_tld');
    expect(firedIds('https://dhl.de/')).not.toContain('brand_on_foreign_tld');
  });

  it('does not flag the brand on its own domain', () => {
    expect(firedIds('https://www.roblox.com/users/1/profile'))
      .not.toContain('brand_on_foreign_tld');
  });

  it('does not flag a legitimate regional variant listed for the brand', () => {
    expect(firedIds('https://www.ebay.com.au/')).not.toContain('brand_on_foreign_tld');
    expect(firedIds('https://www.apple.com.au/')).not.toContain('brand_on_foreign_tld');
  });
});
