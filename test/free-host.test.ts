/**
 * Sign-in pages on free website hosts, the largest group of missed attacks in
 * the November 2026 benchmark. Each attack sits next to its honest twin.
 */
import { describe, expect, it } from 'vitest';
import type { DomEvidence, PageEvidence } from '../src/core/types.js';
import { evidenceFromUrl } from '../src/core/evidence.js';
import { evaluate } from '../src/core/score.js';

const emptyDom: DomEvidence = {
  title: '', hasPasswordField: false, passwordFieldVisible: false, passwordFormActions: [],
  crossOriginPasswordForm: false, insecurePasswordFormAction: false, hiddenIframeCount: 0,
  brandTokens: [], externalFavicon: false, faviconHost: undefined, pasteBlocked: false,
  contextMenuBlocked: false, obfuscationScore: 0, linkCount: 0, deadLinkRatio: 0,
};
const page = (url: string, dom: Partial<DomEvidence> = {}, extra: Partial<PageEvidence> = {}): PageEvidence =>
  ({ ...evidenceFromUrl(url)!, dom: { ...emptyDom, ...dom }, ...extra });
const login = { hasPasswordField: true, passwordFieldVisible: true, title: 'Accéder à mes comptes en ligne' };
const ids = (e: PageEvidence) => evaluate(e).conclusions.map((c) => c.id);

describe('a sign-in page on a free host', () => {
  it('a bank-style login on vercel.app is suspicious, with a reason', () => {
    const v = evaluate(page('https://francebnap.vercel.app/', login));
    expect(v.conclusions[0]?.id).toBe('sign_in_on_free_host');
    expect(v.band).toBe('suspicious');
  });
  it('the same on pages.dev', () => {
    expect(ids(page('https://naciomverificar-7mqh.pages.dev/', login))).toContain('sign_in_on_free_host');
  });
  it('a portfolio on vercel.app with no password box stays quiet', () => {
    expect(ids(page('https://aryan-portfolio.vercel.app/', { title: 'Aryan, security writeups' }))).not.toContain('sign_in_on_free_host');
  });
  it('the platform\'s own sign-in page is not flagged', () => {
    expect(ids(page('https://vercel.com/login', login))).not.toContain('sign_in_on_free_host');
  });
});

describe('free hosts missing from the public suffix list', () => {
  it('a user page on zapier.app counts as free hosting', () => {
    const v = evaluate(page('https://homecinbaseprowerb.zapier.app/', { ...login, title: 'Coinbase Pro Sign In' }, { domainAgeDays: 3000 }));
    expect(v.signals.map((s) => s.id)).toContain('free_hosting_subdomain');
  });
  it('and does not earn the platform\'s age as its own', () => {
    const v = evaluate(page('https://homecinbaseprowerb.zapier.app/', login, { domainAgeDays: 3000 }));
    expect(v.signals.map((s) => s.id)).not.toContain('domain_well_established');
  });
  it('zapier.app itself still does', () => {
    const v = evaluate(page('https://zapier.app/', {}, { domainAgeDays: 3000 }));
    expect(v.signals.map((s) => s.id)).toContain('domain_well_established');
  });
});

describe('regional brands', () => {
  it('a DKB sign-in on a stranger\'s domain is a fake DKB page', () => {
    const v = evaluate(page('https://arrondhevie.bj/', { hasPasswordField: true, passwordFieldVisible: true, title: 'DKB Banking', brandTokens: ['dkb'] }));
    expect(v.band).toBe('danger');
  });
  it('DKB\'s own site is not', () => {
    const v = evaluate(page('https://banking.dkb.de/login', { hasPasswordField: true, passwordFieldVisible: true, title: 'DKB Banking', brandTokens: ['dkb'] }));
    expect(v.band).not.toBe('danger');
  });
});

describe('official sites people use abroad, and new ones', () => {
  const oldGovLogin = { hasPasswordField: true, passwordFieldVisible: true, title: 'Login | Land Records', insecurePasswordFormAction: false };
  it('a brand-new Indian government sign-in page is not judged by guesswork', () => {
    const v = evaluate(page('https://newportal.mahabhumi.gov.in/login', oldGovLogin, { domainAgeDays: 5 }));
    expect(v.band === 'clean' || v.band === 'caution').toBe(true);
  });
  it('a lookalike that only sounds official is still judged', () => {
    const v = evaluate(page('https://mahabhumi-gov-in.com/login', oldGovLogin, { domainAgeDays: 5 }));
    expect(v.conclusions.map((c) => c.id)).toContain('fresh_domain_credential_form');
  });
  it('a fake Microsoft sign-in page on a hacked university site is still danger', () => {
    const v = evaluate(page('https://www.physics.example.edu/wp-content/uploads/o365/index.html', {
      hasPasswordField: true, passwordFieldVisible: true, title: 'Sign in to your Microsoft account', brandTokens: ['microsoft'], loginFingerprints: ['microsoft'],
    }));
    expect(v.band).toBe('danger');
  });
  it('a hacked government site on a scam list is still caught', () => {
    const v = evaluate(page('https://council.example.gov.au/wp-content/x/login.php', oldGovLogin, { blocklistHit: true }));
    expect(v.band).toBe('danger');
  });
});
