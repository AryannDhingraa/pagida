import { describe, expect, it } from 'vitest';
import { parseHost, sameSite } from '../src/core/util/domain.js';

describe('parseHost', () => {
  it('finds the registrable domain for a simple host', () => {
    const p = parseHost('login.paypal.com');
    expect(p.registrableDomain).toBe('paypal.com');
    expect(p.sld).toBe('paypal');
    expect(p.suffix).toBe('com');
    expect(p.subdomains).toEqual(['login']);
  });

  it('handles Australian two-part suffixes', () => {
    expect(parseHost('www.commbank.com.au').registrableDomain).toBe('commbank.com.au');
    expect(parseHost('my.gov.au').registrableDomain).toBe('my.gov.au');
  });

  it('handles UK two-part suffixes', () => {
    expect(parseHost('secure.barclays.co.uk').registrableDomain).toBe('barclays.co.uk');
  });

  it('treats per-user hosting suffixes as public suffixes', () => {
    expect(parseHost('aryan.github.io').registrableDomain).toBe('aryan.github.io');
    expect(parseHost('evil.pages.dev').registrableDomain).toBe('evil.pages.dev');
  });

  it('recognises bare IPv4 hosts', () => {
    const p = parseHost('192.168.1.1');
    expect(p.isIpLiteral).toBe(true);
    expect(p.registrableDomain).toBe('192.168.1.1');
  });

  it('counts deep subdomain nesting', () => {
    const p = parseHost('a.b.c.d.example.com');
    expect(p.subdomains).toEqual(['a', 'b', 'c', 'd']);
  });

  it('is case-insensitive and tolerates a trailing dot', () => {
    expect(parseHost('WWW.Example.COM.').registrableDomain).toBe('example.com');
  });
});

describe('sameSite', () => {
  it('matches across subdomains', () => {
    expect(sameSite('https://a.example.com/x', 'https://b.example.com/y')).toBe(true);
  });
  it('rejects different registrable domains', () => {
    expect(sameSite('https://paypal.com', 'https://paypal.evil.tk')).toBe(false);
  });
  it('returns false for malformed input', () => {
    expect(sameSite('not a url', 'https://example.com')).toBe(false);
  });
});

describe('the real Public Suffix List', () => {
  // Every one of these was parsed wrongly by the hand-written suffix table.
  // They are the reason the full list now ships.
  it.each([
    // suffix, host, expected registrable domain
    ['uk sub-suffix',        'www.bbc.co.uk',              'bbc.co.uk'],
    ['jp prefecture',        'foo.city.chiyoda.tokyo.jp',  'city.chiyoda.tokyo.jp'],
    // `*.ck` makes every label under `ck` a suffix, so `example.ck` is the
    // suffix and `shop` is what somebody registered.
    ['wildcard suffix',      'shop.example.ck',            'shop.example.ck'],
    ['wildcard, deeper',     'a.b.example.ck',             'b.example.ck'],
    ['brazil nom wildcard',  'x.example.nom.br',           'x.example.nom.br'],
    ['long generic tld',     'login.example.education',    'example.education'],
    ['hosting suffix',       'someone.github.io',          'someone.github.io'],
    ['hosting, with sub',    'docs.someone.github.io',     'someone.github.io'],
    ['aws regional s3',      'bucket.s3.ap-southeast-2.amazonaws.com', 'bucket.s3.ap-southeast-2.amazonaws.com'],
    ['australian gov',       'my.services.gov.au',         'services.gov.au'],
    ['no rule at all',       'thing.invalidtldxyzzy',      'thing.invalidtldxyzzy'],
  ])('parses %s correctly', (_label, host, expected) => {
    expect(parseHost(host).registrableDomain).toBe(expected);
  });

  it('honours the exception rules that punch holes in wildcards', () => {
    // `!www.ck` is an explicit exception to `*.ck`, so www.ck is itself
    // registrable rather than being a public suffix.
    expect(parseHost('www.ck').registrableDomain).toBe('www.ck');
  });

  it('does not let a subdomain masquerade as the registrable domain', () => {
    // The whole point. If this returns paypal.com, every brand rule downstream
    // treats an attacker's site as PayPal's own.
    expect(parseHost('paypal.com.secure-login.tk').registrableDomain).toBe('secure-login.tk');
    expect(parseHost('accounts.google.com.evil.co.uk').registrableDomain).toBe('evil.co.uk');
  });
});
