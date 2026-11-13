/**
 * Context: this person's own history with a site, and how they reached it.
 * Each attack sits next to the honest case it could be confused with.
 */
import { describe, expect, it } from 'vitest';
import type { DomEvidence, PageEvidence } from '../src/core/types.js';
import { evidenceFromUrl } from '../src/core/evidence.js';
import { evaluate } from '../src/core/score.js';
import { DAY, familiarity, historyKey, noteVisit, prune, TRUST_DAYS, TRUST_SPAN_DAYS, type HistoryEntry } from '../src/core/history.js';

const emptyDom: DomEvidence = {
  title: '', hasPasswordField: false, passwordFieldVisible: false, passwordFormActions: [],
  crossOriginPasswordForm: false, insecurePasswordFormAction: false, hiddenIframeCount: 0,
  brandTokens: [], externalFavicon: false, faviconHost: undefined, pasteBlocked: false,
  contextMenuBlocked: false, obfuscationScore: 0, linkCount: 0, deadLinkRatio: 0,
};
const page = (url: string, dom: Partial<DomEvidence> = {}, extra: Partial<PageEvidence> = {}): PageEvidence =>
  ({ ...evidenceFromUrl(url)!, dom: { ...emptyDom, ...dom }, ...extra });
const ids = (e: PageEvidence) => evaluate(e).conclusions.map((c) => c.id);
const login = { hasPasswordField: true, passwordFieldVisible: true };

describe('what the memory is about', () => {
  it('two Google Docs are two different things, not "Google"', () => {
    const a = historyKey('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit');
    const b = historyKey('https://docs.google.com/document/d/9ZyXwVuTsRqPoNmLk/edit');
    expect(a).not.toBe(b);
    expect(a).toContain('docs.google.com#');
  });
  it('the same Doc at different addresses is one thing', () => {
    expect(historyKey('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit?usp=sharing'))
      .toBe(historyKey('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/view'));
  });
  it('each Google Form is its own thing', () => {
    expect(historyKey('https://docs.google.com/forms/d/e/1FAIpQLSdAbCdEfGh/viewform'))
      .not.toBe(historyKey('https://docs.google.com/forms/d/e/1FAIpQLSzYxWvUtSr/viewform'));
  });
  it('each free-hosted site is its own thing; an ordinary site is its domain', () => {
    expect(historyKey('https://alice.vercel.app/x')).not.toBe(historyKey('https://bob.vercel.app/x'));
    expect(historyKey('https://www.bendigobank.com.au/a')).toBe(historyKey('https://banking.bendigobank.com.au/b'));
  });
  it('the home network is never remembered', () => {
    expect(historyKey('http://192.168.1.1/')).toBe(null);
    expect(historyKey('http://router/')).toBe(null);
  });
});

describe('when history counts', () => {
  const visits = (days: number[], warnedOn = -1): HistoryEntry | undefined =>
    days.reduce<HistoryEntry | undefined>((e, d) => noteVisit(e, d * DAY, d === warnedOn), undefined);
  it('a site used on enough days over weeks is trusted', () => {
    expect(familiarity(visits([0, 3, 7, 14]), 14 * DAY).trusted).toBe(true);
  });
  it('the same number of visits in one afternoon is not', () => {
    expect(familiarity(visits([0, 0, 0, 0, 0]), 0).trusted).toBe(false);
  });
  it('enough days but too short a span is not', () => {
    expect(familiarity(visits([0, 1, 2, 3]), 3 * DAY).trusted).toBe(false);
    expect(TRUST_DAYS).toBe(4);
    expect(TRUST_SPAN_DAYS).toBe(14);
  });
  it('one warning ends the trust for good', () => {
    const f = familiarity(visits([0, 3, 7, 14, 20], 7), 20 * DAY);
    expect(f.trusted).toBe(false);
    expect(f.warnedBefore).toBe(true);
  });
  it('a site never seen is a first visit', () => {
    expect(familiarity(undefined, 0).firstVisit).toBe(true);
  });
  it('forgets what was not seen for six months', () => {
    const kept = prune({ old: { first: 0, last: 0, days: 1, warned: false }, fresh: { first: 300, last: 300, days: 1, warned: false } }, 300 * DAY);
    expect(Object.keys(kept)).toEqual(['fresh']);
  });
});

describe('your own sites stop being judged by guesswork', () => {
  // A small council portal: new domain, odd address, a password box.
  const portal = (history?: PageEvidence['history']) =>
    page('https://ratesportal-shirecouncil.com/login', login, { domainAgeDays: 20, history });
  it('on a first visit it is judged as usual', () => {
    expect(evaluate(portal({ firstVisit: true, trusted: false, warnedBefore: false })).band).not.toBe('clean');
  });
  it('once you have used it for weeks, guesswork alone stops at "Worth a look"', () => {
    const v = evaluate(portal({ firstVisit: false, trusted: true, warnedBefore: false }));
    expect(['clean', 'caution']).toContain(v.band);
  });
  it('but a real reason still warns, even on a trusted site', () => {
    const v = evaluate(page('https://ratesportal-shirecouncil.com/login', {
      ...login, crossOriginPasswordForm: true, passwordFormActions: ['https://collector.example/p'],
    }, { domainAgeDays: 200, history: { firstVisit: false, trusted: true, warnedBefore: false } }));
    expect(v.band).toBe('danger');
  });
});

describe('opened from an email', () => {
  const fromScam = { fromEmail: true as const, emailBand: 'danger' as const, emailWarned: true };
  const fromFine = { fromEmail: true as const, emailBand: 'clean' as const, emailWarned: false };
  it('a sign-in page opened from an email Pagida warned about is danger, even if it looks clean', () => {
    const v = evaluate(page('https://account-review-centre.com/', login, { domainAgeDays: 900, arrival: fromScam }));
    expect(v.conclusions.map((c) => c.id)).toContain('from_warned_email');
    expect(v.band).toBe('danger');
  });
  it('a stranger\'s Google Doc opened from that email inherits the warning', () => {
    expect(ids(page('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit', {}, { arrival: fromScam }))).toContain('from_warned_email');
  });
  it('YouTube opened from that email does not become a scam', () => {
    expect(ids(page('https://www.youtube.com/watch?v=x', {}, { arrival: fromScam }))).not.toContain('from_warned_email');
  });
  it('a page opened from a normal email is judged as usual', () => {
    expect(ids(page('https://account-review-centre.com/', login, { domainAgeDays: 900, arrival: fromFine }))).not.toContain('from_warned_email');
  });
  it('a first visit to a sign-in page from an email adds a small signal, not a verdict', () => {
    const v = evaluate(page('https://account-review-centre.com/', login, { domainAgeDays: 900, arrival: fromFine, history: { firstVisit: true, trusted: false, warnedBefore: false } }));
    expect(v.signals.map((s) => s.id)).toContain('first_visit_from_email');
    expect(v.conclusions).toEqual([]);
  });
});

describe('passwords in online forms', () => {
  const form = 'https://docs.google.com/forms/d/e/1FAIpQLSdAbCdEfGh/viewform';
  it('a Google Form asking for an email and password is danger', () => {
    const v = evaluate(page(form, { formAsksPassword: true, formAsksEmail: true }));
    expect(v.conclusions[0]?.id).toBe('password_in_online_form');
    expect(v.band).toBe('danger');
  });
  it('a Google Form asking only for an email (a sign-up sheet) is fine', () => {
    expect(ids(page(form, { formAsksEmail: true }))).toEqual([]);
  });
  it('a Microsoft Form asking for a password is danger too', () => {
    expect(ids(page('https://forms.office.com/Pages/ResponsePage.aspx?id=AbCdEfGhIjKlMn', { formAsksPassword: true, formAsksEmail: true })))
      .toContain('password_in_online_form');
  });
  it('a password field on an ordinary site is not this rule', () => {
    expect(ids(page('https://www.bendigobank.com.au/login', { formAsksPassword: true, formAsksEmail: true }))).not.toContain('password_in_online_form');
  });
});
