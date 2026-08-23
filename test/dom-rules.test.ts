import { describe, expect, it } from 'vitest';
import type { DomEvidence, PageEvidence } from '../src/core/types.js';
import { evidenceFromUrl, evidenceSignature } from '../src/core/evidence.js';
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
  faviconHost: undefined,
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

  it('does not flag a well-known site for loading its icon from a CDN', () => {
    // google.com serving its favicon from gstatic.com is not a hotlink, and an
    // earlier version scored Google as suspicious for exactly this.
    expect(ids(page('https://aistudio.google.com/prompts/1LPZXruWzGRT5Rz3qpLVzhx30xU22jQNi',
      { externalFavicon: true, faviconHost: 'www.gstatic.com' })))
      .not.toContain('hotlinked_brand_favicon');
  });

  it('does not flag a token in the path of a well-known site', () => {
    expect(ids(page('https://aistudio.google.com/prompts/1LPZXruWzGRT5Rz3qpLVzhx30xU22jQNi')))
      .not.toContain('generated_path_segment');
  });

  it('scores a well-known site clean when nothing behavioural is wrong', () => {
    const v = evaluate(page('https://aistudio.google.com/prompts/1LPZXruWzGRT5Rz3qpLVzhx30xU22jQNi',
      { externalFavicon: true, faviconHost: 'www.gstatic.com', hiddenIframeCount: 2, obfuscationScore: 0.8 }));
    expect(v.band, `fired: ${v.signals.map((s) => s.id).join(', ')}`).toBe('clean');
  });

  it('still flags a hotlinked brand icon on a site nobody knows', () => {
    expect(ids(page('https://account-verify-portal.tk/login',
      { externalFavicon: true, faviconHost: 'www.paypal.com', hasPasswordField: true })))
      .toContain('hotlinked_brand_favicon');
  });

  it('still scores a compromised well-known site on behaviour', () => {
    // The allowlist must never protect a site that is posting your password
    // somewhere else.
    expect(ids(page('https://aistudio.google.com/login',
      { hasPasswordField: true, crossOriginPasswordForm: true, passwordFormActions: ['https://evil.tk/x'] })))
      .toContain('cross_origin_password_form');
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

describe('re-scan fingerprint', () => {
  it('is stable when nothing the engine scores has changed', () => {
    const a = evidenceSignature('https://x.com/', { ...emptyDom, title: 'One' });
    const b = evidenceSignature('https://x.com/', { ...emptyDom, title: 'Two' });
    // The page title is not a scored signal, so it must not trigger a re-scan.
    expect(a).toBe(b);
  });

  it('changes when a credential form appears', () => {
    const before = evidenceSignature('https://x.com/', emptyDom);
    const after = evidenceSignature('https://x.com/', { ...emptyDom, hasPasswordField: true });
    expect(after).not.toBe(before);
  });

  it('changes when the form target changes', () => {
    const a = evidenceSignature('https://x.com/', { ...emptyDom, passwordFormActions: ['https://x.com/l'] });
    const b = evidenceSignature('https://x.com/', { ...emptyDom, passwordFormActions: ['https://evil.tk/l'] });
    expect(a).not.toBe(b);
  });

  it('changes on navigation', () => {
    expect(evidenceSignature('https://x.com/a', emptyDom))
      .not.toBe(evidenceSignature('https://x.com/b', emptyDom));
  });

  it('ignores sub-pixel drift in the ratio fields', () => {
    const a = evidenceSignature('https://x.com/', { ...emptyDom, deadLinkRatio: 0.500 });
    const b = evidenceSignature('https://x.com/', { ...emptyDom, deadLinkRatio: 0.501 });
    expect(a).toBe(b);
  });
});

describe('band names line up with the stylesheet', () => {
  it('uses exactly the four names theme.css styles', async () => {
    const css = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../src/shared/theme.css', import.meta.url), 'utf8'));
    // Every band the engine can produce must have a rule, or that verdict
    // renders in whatever colour the previous one left behind.
    for (const band of ['clean', 'caution', 'suspicious', 'danger']) {
      expect(css, `theme.css is missing [data-band="${band}"]`).toContain(`[data-band="${band}"]`);
    }
  });

  it('maps each band to the intended colour family', async () => {
    const css = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../src/shared/theme.css', import.meta.url), 'utf8'));
    const ruleFor = (band: string) =>
      css.split('\n').find((l) => l.startsWith(`[data-band="${band}"]`)) ?? '';
    expect(ruleFor('clean')).toContain('var(--safe)');
    expect(ruleFor('caution')).toContain('var(--notice)');
    expect(ruleFor('suspicious')).toContain('var(--caution)');
    expect(ruleFor('danger')).toContain('var(--danger)');
  });
});

describe('the Pagida service reputation signal', () => {
  it('scores a Web Risk listing as danger even on an otherwise plain URL', () => {
    const verdict = evaluate({
      ...evidenceFromUrl('https://ordinary-looking-site.com/login')!,
      webRiskHit: true,
      webRiskThreats: ['SOCIAL_ENGINEERING'],
    });
    expect(verdict.band).toBe('danger');
    expect(verdict.signals.map((s) => s.id)).toContain('web_risk_match');
  });

  it('says what Google actually called it, rather than a generic warning', () => {
    const verdict = evaluate({
      ...evidenceFromUrl('https://ordinary-looking-site.com/')!,
      webRiskHit: true,
      webRiskThreats: ['MALWARE'],
    });
    const signal = verdict.signals.find((s) => s.id === 'web_risk_match');
    expect(signal?.detail).toContain('malware');
  });

  it('stays silent when the lookup came back clean', () => {
    const verdict = evaluate({
      ...evidenceFromUrl('https://ordinary-looking-site.com/')!,
      webRiskHit: false,
      webRiskThreats: [],
    });
    expect(verdict.signals.map((s) => s.id)).not.toContain('web_risk_match');
  });
});
