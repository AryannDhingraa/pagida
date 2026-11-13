/**
 * Copies of a site the person really signs in to. Each attack sits next to the
 * honest case it could be confused with.
 */
import { describe, expect, it } from 'vitest';
import type { DomEvidence, PageEvidence } from '../src/core/types.js';
import { evidenceFromUrl } from '../src/core/evidence.js';
import { evaluate } from '../src/core/score.js';
import { copiedSignInSite, rememberSignIn, SIGN_IN_LIMIT, type SignInMemory } from '../src/core/familiar.js';

// Two real-looking, unrelated icon fingerprints (32 of 64 bits set each).
const BANK_ICON = 'f0f0f0f00f0f0f0f';
const COUNCIL_ICON = 'cc33cc33cc33cc33';
const nearly = (h: string) => `${h.slice(0, 15)}${(parseInt(h[15]!, 16) ^ 1).toString(16)}`; // one bit off

const memory: SignInMemory = {
  'bendigobank.com.au': { icon: BANK_ICON, at: 1 },
  'melbourne.vic.gov.au': { icon: COUNCIL_ICON, at: 2 },
};

describe('which of your sites a page is copying', () => {
  it('names the site whose icon a stranger wears', () => {
    expect(copiedSignInSite(memory, 'bendigo-secure-login.com', BANK_ICON)).toBe('bendigobank.com.au');
    expect(copiedSignInSite(memory, 'bendigo-secure-login.com', nearly(BANK_ICON))).toBe('bendigobank.com.au');
  });
  it('is quiet on the site itself', () => {
    expect(copiedSignInSite(memory, 'bendigobank.com.au', BANK_ICON)).toBe(null);
  });
  it('is quiet on the same organisation under another ending', () => {
    expect(copiedSignInSite(memory, 'bendigobank.com', BANK_ICON)).toBe(null);
  });
  it('is quiet when the icon is unrelated', () => {
    expect(copiedSignInSite(memory, 'some-shop.com', '0123456789abcdef')).toBe(null);
  });
  it('ignores an icon two of your own sites share: a platform default, not an identity', () => {
    const shared: SignInMemory = { ...memory, 'myclub.org': { icon: BANK_ICON, at: 3 } };
    expect(copiedSignInSite(shared, 'random-login.com', BANK_ICON)).toBe(null);
  });
  it('ignores blank and solid icons', () => {
    const blank: SignInMemory = { 'a.com': { icon: '0000000000000000', at: 1 } };
    expect(copiedSignInSite(blank, 'b.com', '0000000000000000')).toBe(null);
  });
});

describe('remembering sign-ins', () => {
  it('keeps the newest when full', () => {
    let m: SignInMemory = {};
    for (let i = 0; i <= SIGN_IN_LIMIT; i++) m = rememberSignIn(m, `site${i}.com`, BANK_ICON, i);
    expect(Object.keys(m)).toHaveLength(SIGN_IN_LIMIT);
    expect(m['site0.com']).toBeUndefined();
    expect(m[`site${SIGN_IN_LIMIT}.com`]).toBeDefined();
  });
  it('does not store an icon with nothing in it', () => {
    expect(rememberSignIn({}, 'a.com', 'ffffffffffffffff', 1)).toEqual({});
  });
});

const emptyDom: DomEvidence = {
  title: '', hasPasswordField: false, passwordFieldVisible: false, passwordFormActions: [],
  crossOriginPasswordForm: false, insecurePasswordFormAction: false, hiddenIframeCount: 0,
  brandTokens: [], externalFavicon: false, faviconHost: undefined, pasteBlocked: false,
  contextMenuBlocked: false, obfuscationScore: 0, linkCount: 0, deadLinkRatio: 0,
};
const page = (url: string, dom: Partial<DomEvidence> = {}, extra: Partial<PageEvidence> = {}): PageEvidence =>
  ({ ...evidenceFromUrl(url)!, dom: { ...emptyDom, ...dom }, ...extra });
const signIn = { hasPasswordField: true, passwordFieldVisible: true };

describe('the warning', () => {
  it('says which site is being copied, at suspicious on the icon alone', () => {
    const v = evaluate(page('https://bendigo-secure-login.com/', { ...signIn, copiesSignInSite: 'bendigobank.com.au' }, { domainAgeDays: 400 }));
    expect(v.conclusions[0]?.id).toBe('copy_of_your_sign_in');
    expect(v.conclusions[0]?.title).toContain('bendigobank.com.au');
    expect(v.band).toBe('suspicious');
  });
  it('is a full warning with a second tell: a brand-new domain', () => {
    const v = evaluate(page('https://bendigo-secure-login.com/', { ...signIn, copiesSignInSite: 'bendigobank.com.au' }, { domainAgeDays: 3 }));
    expect(v.band).toBe('danger');
  });
  it('is a full warning when the password leaves for a third site', () => {
    const v = evaluate(page('https://bendigo-secure-login.com/', {
      ...signIn, copiesSignInSite: 'bendigobank.com.au', crossOriginPasswordForm: true, passwordFormActions: ['https://collector.example/p'],
    }, { domainAgeDays: 400 }));
    expect(v.band).toBe('danger');
  });
  it('does not fire on a page that asks for no password', () => {
    const v = evaluate(page('https://bendigo-fan-blog.com/', { copiesSignInSite: 'bendigobank.com.au' }, { domainAgeDays: 400 }));
    expect(v.conclusions.map((c) => c.id)).not.toContain('copy_of_your_sign_in');
  });
  it('does not fire on a top site', () => {
    const v = evaluate(page('https://www.google.com/', { ...signIn, copiesSignInSite: 'bendigobank.com.au' }));
    expect(v.conclusions.map((c) => c.id)).not.toContain('copy_of_your_sign_in');
  });
});
