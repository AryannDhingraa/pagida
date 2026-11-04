/**
 * Regression tests for the v3 false positives found by loading the shipped
 * extension against 160 real sites (Nov 2026). Every case here was a real page
 * that v3 called "Likely phishing" or "Suspicious".
 */
import { describe, expect, it } from 'vitest';
import type { DomEvidence, PageEvidence } from '../src/core/types.js';
import { evidenceFromUrl } from '../src/core/evidence.js';
import { evaluate } from '../src/core/score.js';
import { identityBrands, wholeWordTokens } from '../src/core/brandText.js';
import { isPrivateHost, isSharedHost } from '../src/core/util/network.js';

const emptyDom: DomEvidence = {
  title: '', hasPasswordField: false, passwordFieldVisible: false, passwordFormActions: [],
  crossOriginPasswordForm: false, insecurePasswordFormAction: false, hiddenIframeCount: 0,
  brandTokens: [], externalFavicon: false, faviconHost: undefined, pasteBlocked: false,
  contextMenuBlocked: false, obfuscationScore: 0, linkCount: 0, deadLinkRatio: 0,
};
const page = (url: string, dom: Partial<DomEvidence> = {}, extra: Partial<PageEvidence> = {}): PageEvidence =>
  ({ ...evidenceFromUrl(url)!, dom: { ...emptyDom, ...dom }, ...extra });

describe('brand identity, not brand mentions', () => {
  it('ignores social sign-in buttons', () => {
    expect(identityBrands({ selfName: ['Figma'], headings: ['Log in to Figma', 'Continue with Google'], logos: [] })).toEqual([]);
    expect(identityBrands({ selfName: ['Sign in · Atlassian'], headings: ['Log in with Microsoft'], logos: [] })).not.toContain('microsoft');
  });
  it('ignores payment badges', () => {
    expect(wholeWordTokens('Pay later with Afterpay. Apple Pay accepted. Pay with PayPal', false)).toEqual([]);
  });
  it('matches whole words only', () => {
    expect(wholeWordTokens('Complete your purchase, otherwise we permit the sales team', true)).toEqual([]);
  });
  it('still catches the phishing heading "Sign in with your Microsoft account"', () => {
    expect(identityBrands({ selfName: ['Sign in to your account'], headings: ['Sign in with your Microsoft account'], logos: [] }))
      .toContain('microsoft');
  });
  it('joins multi-word brand names', () => {
    expect(wholeWordTokens('Commonwealth Bank NetBank log on', false)).toContain('commonwealthbank');
  });
  it('accepts ambiguous words only from the page name', () => {
    expect(identityBrands({ selfName: ['Book a table'], headings: ['Zoom in on our menu'], logos: [] })).toEqual([]);
    expect(identityBrands({ selfName: ['Zoom - Sign In'], headings: [], logos: [] })).toEqual(['zoom']);
  });
});

describe('real sites v3 called "Likely phishing"', () => {
  it('a well-known SaaS login naming another brand is not impersonation', () => {
    const v = evaluate(page('https://www.figma.com/login',
      { hasPasswordField: true, passwordFieldVisible: true, brandTokens: ['google'] }, { domainAgeDays: 6000 }));
    expect(v.band).toBe('clean');
  });
  it('a hidden login modal is not a page asking for a password', () => {
    const v = evaluate(page('https://www.myer.com.au/',
      { hasPasswordField: true, passwordFieldVisible: false, brandTokens: ['afterpay'] }));
    expect(v.conclusions).toEqual([]);
  });
  it('federated sign-in posting to Okta is not "password sent elsewhere"', () => {
    const v = evaluate(page('https://portal.acme-widgets.com.au/login',
      { hasPasswordField: true, passwordFieldVisible: true, crossOriginPasswordForm: true,
        passwordFormActions: ['https://acme.okta.com/login/do-login'] }, { domainAgeDays: 3000 }));
    expect(v.conclusions.map((c) => c.id)).not.toContain('password_posted_offsite');
  });
  it('but a form posting to a Telegram bot still is', () => {
    const v = evaluate(page('https://portal.acme-widgets.com.au/login',
      { hasPasswordField: true, passwordFieldVisible: true, crossOriginPasswordForm: true,
        passwordFormActions: ['https://api.telegram.org/bot123/sendMessage'] }));
    expect(v.band).toBe('danger');
  });
});

describe('your own network', () => {
  it.each(['192.168.1.1', '10.0.0.5', '127.0.0.1', 'localhost', 'homeassistant.local', 'jira', 'nas.home.arpa', '100.101.102.103'])(
    '%s is private', (h) => expect(isPrivateHost(h)).toBe(true));
  it.each(['8.8.8.8', 'example.com', 'local.com', '172.32.0.1'])('%s is public', (h) => expect(isPrivateHost(h)).toBe(false));
  it('a router login on http://192.168.0.1 is not phishing', () => {
    const v = evaluate(page('http://192.168.0.1/', { hasPasswordField: true, passwordFieldVisible: true }));
    expect(v.band).toBe('clean');
  });
});

describe('shared hosts', () => {
  it('a public suffix used as a host is shared', () => {
    expect(isSharedHost('s3.us-east-2.amazonaws.com', '', false)).toBe(true);
    expect(isSharedHost('docs.google.com', 'google', true)).toBe(true);
    expect(isSharedHost('wquie-eiiow201113.pages.dev', 'wquie-eiiow201113', false)).toBe(false);
  });
});

describe('heuristics cannot shout on their own', () => {
  it('an old domain with an odd address tops out at "worth a look"', () => {
    const v = evaluate(page('https://booking.myclinic.com.au/appointments/a8f3k2j9x7q1w4e6', {}, { domainAgeDays: 4000 }));
    expect(['clean', 'caution']).toContain(v.band);
  });
  it('a brand in the hostname still reaches danger', () => {
    const v = evaluate(evidenceFromUrl('http://paypal-secure-login.verify-account.tk/signin')!);
    expect(v.band).toBe('danger');
  });
});

describe('v4 keeps catching what v3 caught for the right reasons', () => {
  it('a branded page on a 20-day-old domain is called out even without a login form', () => {
    const v = evaluate(page('https://www.roblox.com.ss/users/123/profile',
      { brandTokens: ['roblox'], externalFavicon: true, faviconHost: 'www.roblox.com' }, { domainAgeDays: 20 }));
    expect(v.conclusions.map((c) => c.id)).toContain('brand_lookalike_page');
    expect(['suspicious', 'danger']).toContain(v.band);
  });
  it('a phishing page in an old site\'s /wp-includes/ is not softened by the domain\'s age', () => {
    const v = evaluate(page('https://qbl-bd.com/wp-includes/document/rdyy/index.html', { brandTokens: ['adobe'] }, { domainAgeDays: 3000 }));
    expect(v.band).toBe('suspicious');
  });
  it('a hidden password form wired to a stranger is still danger', () => {
    const v = evaluate(page('https://gabiasckrss.vercel.app/',
      { hasPasswordField: true, passwordFieldVisible: false, crossOriginPasswordForm: true, passwordFormActions: ['https://collect.example-drop.ru/p.php'] }));
    expect(v.band).toBe('danger');
  });
});
