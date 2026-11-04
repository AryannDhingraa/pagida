/**
 * The email engine. Every attack case is paired with the legitimate email it
 * could be confused with, because a warning on a real bank email teaches people
 * to ignore warnings.
 */
import { describe, expect, it } from 'vitest';
import { checkLink, evaluateEmail, senderDomain } from '../src/email/evaluate.js';
import { asksToVerify, attachmentRisk, linkTextHost, unwrapLink } from '../src/email/patterns.js';
import type { EmailEvidence, LinkFinding } from '../src/email/types.js';

const mail = (over: Partial<EmailEvidence>): EmailEvidence => ({
  client: 'test', fromName: '', fromAddress: '', subject: '', bodyText: '', links: [], attachments: [], ...over,
});
const run = (e: EmailEvidence, findings?: LinkFinding[]) =>
  evaluateEmail(e, findings ?? e.links.map((l) => checkLink(l.href)));
const ids = (e: EmailEvidence, f?: LinkFinding[]) => run(e, f).conclusions.map((c) => c.id);

describe('who sent it', () => {
  it('CommBank from a Gmail address is danger', () => {
    const v = run(mail({ fromName: 'CommBank', fromAddress: 'commbank.alerts@gmail.com', subject: 'Unusual activity' }));
    expect(v.band).toBe('danger');
    expect(v.conclusions[0]?.id).toBe('impersonated_sender');
  });
  it('CommBank from commbank.com.au is fine', () => {
    const v = run(mail({ fromName: 'CommBank', fromAddress: 'NetBankNotification@notifications.commbank.com.au', subject: 'Your statement is ready' }));
    expect(v.band).toBe('clean');
  });
  it('a lookalike sender domain is danger', () => {
    expect(ids(mail({ fromName: 'Support', fromAddress: 'help@paypal-resolution-center.com', subject: 'Case 4471' }))).toContain('lookalike_sender');
  });
  it('a generic name with a brand in the subject, from a free mailbox', () => {
    expect(ids(mail({ fromName: 'Security Team', fromAddress: 'secure.desk77@outlook.com', subject: 'Your Netflix membership is on hold' })))
      .toContain('impersonated_sender');
  });
  it('a friend at gmail.com is not an impersonator', () => {
    expect(run(mail({ fromName: 'Sam Lee', fromAddress: 'sam.lee@gmail.com', subject: 'Lunch Friday?' })).band).toBe('clean');
  });
  it('parses the sender domain', () => {
    expect(senderDomain('alerts@mail.netflix.com')).toBe('netflix.com');
  });
});

describe('links', () => {
  it('a link that shows paypal.com but goes elsewhere is danger', () => {
    const e = mail({ fromName: 'PayPal', fromAddress: 'service@paypal.com.au', links: [{ text: 'www.paypal.com', href: 'https://secure-check.top/pp/' }] });
    expect(ids(e)).toContain('disguised_link');
  });
  it('a newsletter link wrapped in click tracking is not a disguise', () => {
    const e = mail({ fromName: 'Qantas', fromAddress: 'qantas@e.qantas.com', links: [{ text: 'www.qantas.com', href: 'https://click.e.qantas.com/?qs=abc' }] });
    expect(ids(e)).not.toContain('disguised_link');
    const t = mail({ fromName: 'Shop', fromAddress: 'news@shop.com.au', links: [{ text: 'www.shop.com.au', href: 'https://u123.ct.sendgrid.net/ls/click?upn=x' }] });
    expect(ids(t)).not.toContain('disguised_link');
  });
  it('a link to a listed phishing site is danger, whatever the sender', () => {
    const e = mail({ fromName: 'Ann', fromAddress: 'ann@gmail.com', links: [{ text: 'see this', href: 'https://evil-kit.pages.dev/' }] });
    expect(run(e, [{ href: 'https://evil-kit.pages.dev/', band: 'clean', listed: true }]).band).toBe('danger');
  });
  it('a link whose address imitates a brand is caught by the web engine', () => {
    const e = mail({ fromName: 'Billing', fromAddress: 'billing@acme-invoices.com', links: [{ text: 'Pay now', href: 'http://paypal-secure-login.verify-account.tk/signin' }] });
    expect(ids(e)).toContain('suspicious_link');
  });
  it('unwraps Gmail, Safe Links and Proofpoint redirects', () => {
    expect(unwrapLink('https://www.google.com/url?q=https://evil.top/x&sa=D')).toBe('https://evil.top/x');
    expect(unwrapLink('https://aus01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fevil.top%2F&data=1')).toBe('https://evil.top/');
  });
  it('reads link text that is an address', () => {
    expect(linkTextHost('https://www.commbank.com.au/netbank')).toBe('www.commbank.com.au');
    expect(linkTextHost('Click here')).toBeNull();
  });
});

describe('attachments, QR codes and requests', () => {
  it('an HTML attachment is danger', () => {
    expect(attachmentRisk('Remittance_Advice.html')?.floor).toBe('danger');
    expect(ids(mail({ fromName: 'Accounts', fromAddress: 'ap@supplier.com', attachments: ['INV-2231.htm'] }))).toContain('dangerous_attachment');
  });
  it('a PDF is not', () => {
    expect(attachmentRisk('Invoice 2231.pdf')).toBeNull();
  });
  it('a QR code leading to a flagged page is danger', () => {
    const e = mail({ fromName: 'IT Help Desk', fromAddress: 'it@acme-corp.com', qrUrls: ['https://mfa-reset.top/m'] });
    expect(run(e, [{ href: 'https://mfa-reset.top/m', band: 'suspicious', listed: false, reason: 'New domain' }]).band).toBe('danger');
  });
  it('a request to change bank details is called out, gently', () => {
    const v = run(mail({ fromName: 'Mark (CEO)', fromAddress: 'mark.ceo.office@gmail.com', bodyText: 'Please process the outstanding invoice today and note our updated bank details below.' }));
    expect(v.conclusions.map((c) => c.id)).toContain('payment_scam');
  });
});

describe('the text model only nudges', () => {
  it('a high model score alone never raises a warning', () => {
    const v = run(mail({ fromName: 'Newsletter', fromAddress: 'news@smallshop.com.au', textModelScore: 0.99 }));
    expect(v.conclusions).toEqual([]);
    expect(['clean', 'caution']).toContain(v.band);
  });
});

describe('links that ask before they open', () => {
  const m365 = mail({
    fromName: 'Microsoft 365 Admin', fromAddress: 'it-helpdesk@m365-password-portal.com',
    subject: 'Microsoft 365: password expires today',
    bodyText: 'Your Microsoft password expires today. Keep your current password by confirming your account below.',
    links: [{ text: 'Keep current password', href: 'https://m365-password-portal.com/keep' }],
  });
  it('a brand name on an unknown domain that pushes a sign-in is danger', () => {
    expect(run(m365).band).toBe('danger');
  });
  it('every off-brand link in a fake email is held', () => {
    expect(run(m365).riskyLinks.map((f) => f.href)).toEqual(['https://m365-password-portal.com/keep']);
  });
  it('the real Microsoft renewal email holds nothing', () => {
    const v = run(mail({ fromName: 'Microsoft', fromAddress: 'microsoft-noreply@microsoft.com', subject: 'Your subscription renews soon',
      bodyText: 'You do not need to do anything.', links: [{ text: 'Manage your subscription', href: 'https://account.microsoft.com/services' }] }));
    expect(v.band).toBe('clean');
    expect(v.riskyLinks).toEqual([]);
  });
  it('the target of a disguised link is held', () => {
    const v = run(mail({ fromName: 'Ann', fromAddress: 'ann@gmail.com', links: [{ text: 'www.paypal.com', href: 'https://pp-check.top/x' }] }));
    expect(v.riskyLinks[0]?.href).toBe('https://pp-check.top/x');
  });
});

describe('QR phishing', () => {
  it('"scan to verify" to an unknown site is called out without a flagged page', () => {
    const v = run(mail({ fromName: 'IT Help Desk', fromAddress: 'it@acme-corp.com', bodyText: 'Your MFA expires today. Scan the QR code below with your phone to verify your account.',
      qrUrls: ['https://mfa-reset-portal.top/m/7731'] }), [{ href: 'https://mfa-reset-portal.top/m/7731', band: 'caution', listed: false }]);
    expect(v.conclusions.map((c) => c.id)).toContain('qr_to_bad_page');
  });
  it('a QR code to a known site on a ticket or receipt is not', () => {
    const v = run(mail({ fromName: 'Qantas', fromAddress: 'noreply@qantas.com.au', bodyText: 'Your boarding pass. Show this code at the gate.',
      qrUrls: ['https://www.qantas.com/boarding/abc'] }));
    expect(v.conclusions).toEqual([]);
  });
});

describe('sign-in pressure wording', () => {
  it.each(['Your password expires today', 'Keep your current password', 'Please confirming your account now', 'reactivate your mailbox'])('%s', (t) => {
    expect(asksToVerify(t)).toBe(true);
  });
  it('ordinary wording is not', () => {
    expect(asksToVerify('Your order has been confirmed and will ship tomorrow')).toBe(false);
  });
});


describe('pretending to be your own email provider or IT team', () => {
  const base = { toAddress: 'jose@monkey.org', links: [{ text: 'Review messages', href: 'https://central-web-datamails.vercel.app/x' }] };
  it('"monkey.org Helpdesk" from another domain is danger', () => {
    const v = run(mail({ ...base, fromName: 'monkey.org Helpdesk', fromAddress: 'admin@balanzasvega.com', subject: 'Review these messages', bodyText: 'You have 7 messages on hold.' }));
    expect(v.band).toBe('danger');
    expect(v.conclusions.map((c) => c.id)).toContain('fake_internal_sender');
  });
  it('a real colleague at monkey.org is fine', () => {
    const v = run(mail({ ...base, fromName: 'Ana (monkey.org IT)', fromAddress: 'ana@monkey.org', subject: 'Printer on level 3', bodyText: 'The printer is fixed.', links: [] }));
    expect(v.conclusions).toEqual([]);
  });
  it('a mailbox-full notice whose link goes to a free host is danger', () => {
    const v = run(mail({ fromName: 'E-Mail Hosting Support', fromAddress: 'it@okgrab.com', toAddress: 'jose@monkey.org', subject: 'Your email storage is almost full',
      bodyText: 'Your mailbox storage is almost full. Incoming messages will be held.', links: [{ text: 'Free up space', href: 'https://vmbox-oauth-b.vercel.app/' }] }));
    expect(v.band).toBe('danger');
  });
  it('a newsletter that says "mailbox" in passing is not', () => {
    const v = run(mail({ fromName: 'Smallshop', fromAddress: 'news@smallshop.com.au', subject: 'New arrivals', textModelScore: 0.2,
      bodyText: 'Straight to your mailbox every Friday: new arrivals and offers.', links: [{ text: 'Shop now', href: 'https://smallshop.com.au/new' }] }));
    expect(v.conclusions).toEqual([]);
  });
});

describe('pages anyone could have made', () => {
  it('a sign-in push to an IPFS page is danger', () => {
    const v = run(mail({ fromName: 'Mail Admin', fromAddress: 'x@seeberger-hats.org', subject: 'Incoming mails have been blocked',
      bodyText: 'Verify your account to release your incoming mails.', links: [{ text: 'Release', href: 'https://bafkreicey4.ipfs.flk-ipfs.xyz/' }] }));
    expect(v.conclusions.map((c) => c.id)).toContain('anonymous_host_link');
  });
  it('a friend sharing a GitHub Pages site is not', () => {
    const v = run(mail({ fromName: 'Sam Lee', fromAddress: 'sam@gmail.com', subject: 'my new portfolio', bodyText: 'Made a site, what do you think?',
      links: [{ text: 'samlee.github.io', href: 'https://samlee.github.io/' }], textModelScore: 0.05 }));
    expect(v.conclusions).toEqual([]);
  });
});

describe('callback scams', () => {
  const body = 'Thank you for your purchase of Norton 360 Total Protection for $399.99. If you did not authorize this charge, call our billing team at +1 (805) 422-5610 within 24 hours to cancel.';
  it('a fake renewal with a phone number is called out', () => {
    expect(ids(mail({ fromName: 'Billing Dept', fromAddress: 'david@agratandooricuisine.com', subject: 'Order Number: WMT-982374', bodyText: body }))).toContain('callback_scam');
  });
  it('a newsletter footer with a sales number and a price is not', () => {
    const t = 'New edition, $44.95. Order online or call 1-800-998-9938. To unsubscribe from this newsletter, visit our site.';
    expect(ids(mail({ fromName: "O'Reilly", fromAddress: 'news@oreillynet.com', subject: 'New book', bodyText: t }))).not.toContain('callback_scam');
  });
});

describe('who a sender name claims to be', () => {
  it('a newsletter named after a brand topic does not claim the brand', () => {
    expect(run(mail({ fromName: 'Lockergnome Apple Core', fromAddress: 'subscriptions@lockergnome.com', subject: 'This week' })).conclusions).toEqual([]);
  });
  it('"American Express - Online" claims American Express', () => {
    expect(ids(mail({ fromName: 'American Express - Online', fromAddress: 'x@disk800.com.br', subject: 'Irregular charge noticed' }))).toContain('impersonated_sender');
  });
  it('"Pat Cook via OneDrive" claims OneDrive, and a shared-document lure to elsewhere is danger', () => {
    const v = run(mail({ fromName: 'Pat Cook via OneDrive', fromAddress: 'pat@sizhaungtex.com', subject: 'Completed Document: Signed Contract',
      bodyText: 'Pat Cook shared a document with you. View the document.', links: [{ text: 'Open', href: 'https://isalissat.com/doc' }] }));
    expect(v.band).toBe('danger');
  });
  it('a reply about a brand is a conversation, not an impersonation', () => {
    expect(run(mail({ fromName: '', fromAddress: 'bob@proulx.com', subject: 'Re: Microsoft developer newsletter tagged as spam' })).conclusions).toEqual([]);
  });
});

describe('brand-new domains (online)', () => {
  it('a payment notice from a domain registered last week is called out', () => {
    const v = run(mail({ fromName: 'Accounts', fromAddress: 'ap@freshvendor-pay.com', subject: 'Invoice 4471', domainAges: { 'freshvendor-pay.com': 6 },
      bodyText: 'Please note our updated bank details for the outstanding invoice today.' }));
    expect(v.conclusions.map((c) => c.id)).toContain('new_sender_domain');
  });
  it('a sign-in link to a 3-day-old domain is danger', () => {
    const v = run(mail({ fromName: 'Service', fromAddress: 'news@oldshop.com', subject: 'Verify your account', domainAges: { 'oldshop.com': 4000, 'acct-check-now.com': 3 },
      bodyText: 'Verify your account today.', links: [{ text: 'Verify', href: 'https://acct-check-now.com/v' }] }));
    expect(v.band).toBe('danger');
    expect(v.conclusions.map((c) => c.id)).toContain('new_link_domain');
  });
  it('a new domain alone, with nothing asked, is not a warning', () => {
    const v = run(mail({ fromName: 'Mia', fromAddress: 'mia@miasbakery.com.au', subject: 'We are open!', domainAges: { 'miasbakery.com.au': 12 },
      bodyText: 'Come by for a free coffee this week.' }));
    expect(v.conclusions).toEqual([]);
  });
});
