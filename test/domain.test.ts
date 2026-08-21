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
