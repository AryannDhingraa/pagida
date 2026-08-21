import { describe, expect, it } from 'vitest';
import type { DomEvidence, PageEvidence } from '../src/core/types.js';
import { evidenceFromUrl } from '../src/core/evidence.js';
import { evaluate } from '../src/core/score.js';

const emptyDom: DomEvidence = {
  title: '',
  hasPasswordField: false,
  passwordFormActions: [],
  crossOriginPasswordForm: false,
  insecurePasswordFormAction: false,
  hiddenIframeCount: 0,
  brandTokens: [],
  externalFavicon: false,
  pasteBlocked: false,
  contextMenuBlocked: false,
  obfuscationScore: 0,
  linkCount: 0,
  deadLinkRatio: 0,
};

function page(url: string, dom: Partial<DomEvidence> = {}, extra: Partial<PageEvidence> = {}): PageEvidence {
  const e = evidenceFromUrl(url)!;
  return { ...e, dom: { ...emptyDom, ...dom }, ...extra };
}

const ids = (e: PageEvidence) => evaluate(e).signals.map((s) => s.id);

describe('DOM tier', () => {
  it('flags a password box on an http page', () => {
    expect(ids(page('http://example-portal.com/login', { hasPasswordField: true })))
      .toContain('password_field_over_http');
  });

  it('flags a login form posting to a different site', () => {
    const e = page('https://account-update.com/login', {
      hasPasswordField: true,
      crossOriginPasswordForm: true,
      passwordFormActions: ['https://collector.tk/steal.php'],
    });
    const s = evaluate(e).signals.find((x) => x.id === 'cross_origin_password_form');
    expect(s).toBeDefined();
    expect(s!.detail).toContain('collector.tk');
  });

  it('flags brand content served from the wrong domain', () => {
    expect(ids(page('https://account-check.com/', { brandTokens: ['paypal'] })))
      .toContain('brand_content_mismatch');
  });

  it('does not flag brand content on the brand-owned domain', () => {
    expect(ids(page('https://www.paypal.com/signin', { brandTokens: ['paypal'], hasPasswordField: true })))
      .not.toContain('brand_content_mismatch');
  });

  it('flags a page that blocks paste and right-click', () => {
    const s = evaluate(page('https://x-portal.com/', { pasteBlocked: true, contextMenuBlocked: true }))
      .signals.find((x) => x.id === 'anti_analysis_behaviour');
    expect(s?.weight).toBe(14);
  });

  it('flags hidden iframes and scales with the count', () => {
    const one = evaluate(page('https://x-portal.com/', { hiddenIframeCount: 1 })).score;
    const three = evaluate(page('https://x-portal.com/', { hiddenIframeCount: 3 })).score;
    expect(three).toBeGreaterThan(one);
  });

  it('flags a login page whose navigation is all dead links', () => {
    expect(ids(page('https://x-portal.com/login', {
      hasPasswordField: true, linkCount: 12, deadLinkRatio: 0.95,
    }))).toContain('dead_navigation_links');
  });

  it('does not fire DOM rules when no content script ran', () => {
    const e = evidenceFromUrl('http://example.com/login')!;
    expect(evaluate(e).urlOnly).toBe(true);
    expect(ids(e)).not.toContain('password_field_over_http');
  });
});

describe('compound rules', () => {
  it('fires on a brand-new domain asking for a password', () => {
    expect(ids(page('https://portal-signin.com/', { hasPasswordField: true }, { domainAgeDays: 3 })))
      .toContain('compound_new_domain_credential_form');
  });

  it('fires on a sign-in form for a brand that does not own the site', () => {
    expect(ids(page('https://portal-signin.com/', { hasPasswordField: true, brandTokens: ['commbank'] })))
      .toContain('compound_impersonation_credential_form');
  });
});

describe('reputation tier', () => {
  it('escalates hard for a domain registered days ago', () => {
    expect(ids(page('https://new-site.com/', {}, { domainAgeDays: 2 }))).toContain('domain_age_lt_7d');
  });

  it('gives established domains a credit', () => {
    const s = evaluate(page('https://old-site.com/', {}, { domainAgeDays: 4000 }))
      .signals.find((x) => x.id === 'domain_well_established');
    expect(s!.weight).toBeLessThan(0);
  });

  it('treats a feed URL match as decisive', () => {
    const v = evaluate(page('https://whatever.com/x', {}, { feedUrlHit: true }));
    expect(v.band).toBe('danger');
  });

  it('prefers the exact URL match over the host match', () => {
    const v = evaluate(page('https://whatever.com/x', {}, { feedUrlHit: true, feedHostHit: true }));
    expect(v.signals.map((s) => s.id)).not.toContain('phishing_feed_host_match');
  });

  it('ignores reputation signals entirely when lookups were off', () => {
    const v = evaluate(page('https://whatever.com/x'));
    expect(v.signals.some((s) => s.tier === 'reputation')).toBe(false);
  });
});

describe('user overrides', () => {
  it('a site the user marked safe scores zero regardless of everything else', () => {
    const v = evaluate(page('http://paypal-verify.tk/login',
      { hasPasswordField: true, crossOriginPasswordForm: true },
      { userTrusted: true, domainAgeDays: 1, feedUrlHit: true }));
    expect(v.score).toBe(0);
    expect(v.band).toBe('clean');
    expect(v.override).toBe('trusted');
  });

  it('a site the user reported is always danger', () => {
    const v = evaluate(page('https://www.google.com/', {}, { userReported: true, domainAgeDays: 9000 }));
    expect(v.band).toBe('danger');
    expect(v.override).toBe('reported');
  });
});
