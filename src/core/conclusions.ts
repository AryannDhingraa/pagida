/**
 * Conclusions: the correlation layer.
 *
 * WHY THIS EXISTS
 *
 * The original engine had one output: a sum of weights. That has two failures
 * an audit will find immediately, and both of them are real.
 *
 * The first is that a sum is not a claim. "62" does not mean "62% likely to be
 * phishing". It means some rules fired and their numbers added up. Presenting
 * it beside the words "do not type your password here" borrows an authority the
 * arithmetic has not earned.
 *
 * The second is worse, and shows up in Pagida's own evaluation. On address
 * evidence alone, only 4 of 300 confirmed phishing URLs reached the danger
 * threshold of 55. The band that actually interrupts the user was, in practice,
 * almost unreachable. Raising the weights would have fixed the recall and
 * destroyed the precision, because the weights are cosmetic observations and a
 * cosmetic observation cannot be made trustworthy by making it worth more.
 *
 * A conclusion is the other move. It does not add points. It looks for the
 * shape of an actual attack across independent observations, and when it finds
 * one it sets a *floor* on the band. So a page reaches `danger` because of what
 * it is, not because enough weak rules happened to stack.
 *
 * The discipline that keeps this honest: every conclusion here must be a
 * sentence a person would accept as a reason. If you cannot write the `detail`
 * without hedging, it is a heuristic and it belongs in a rule with a weight.
 */
import type { Band, Conclusion, PageEvidence, Signal } from './types.js';
import { parseHost } from './util/domain.js';
import { BRAND_DOMAINS, isOfficialDomain, isWellKnown } from './data/index.js';
import { isIdentityProvider } from './data/idp.js';
import { asksForSecret, falseClaims } from './identity.js';
import { freeHostOf } from './util/entropy.js';
import { historyKey } from './history.js';

/** A password box the person can actually see and type into. */
const asksForPassword = (e: PageEvidence): boolean =>
  !!e.dom?.hasPasswordField && e.dom.passwordFieldVisible !== false;

/** The password form posts to a third party that is not a known sign-in provider. */
const postsToStranger = (e: PageEvidence): boolean => {
  const dom = e.dom;
  if (!dom?.crossOriginPasswordForm) return false;
  const here = parseHost(e.hostname).registrableDomain;
  if (dom.passwordFormActions.length === 0) return true;
  return dom.passwordFormActions.some((a) => {
    try {
      const d = parseHost(new URL(a).hostname).registrableDomain;
      return d !== here && !isIdentityProvider(d);
    } catch { return false; }
  });
};

/** What a conclusion gets to look at: the evidence, and what already fired. */
export interface ConclusionContext {
  evidence: PageEvidence;
  signals: Signal[];
  /** Signal ids, for cheap membership tests. */
  fired: Set<string>;
}

type ConclusionRule = (c: ConclusionContext) => Conclusion | null;

/**
 * Brand tokens are matched lowercase, but a conclusion is a sentence a person
 * reads. "a fake paypal sign-in page" looks like a typo; "PayPal" looks like
 * the tool knows what it is talking about, and that difference is most of
 * whether the warning gets believed.
 */
const BRAND_CASING: Record<string, string> = {
  paypal: 'PayPal', ebay: 'eBay', youtube: 'YouTube', linkedin: 'LinkedIn',
  github: 'GitHub', gitlab: 'GitLab', whatsapp: 'WhatsApp', icloud: 'iCloud',
  outlook: 'Outlook', onedrive: 'OneDrive', dropbox: 'Dropbox', netflix: 'Netflix',
  commbank: 'CommBank', mygov: 'myGov', auspost: 'AusPost', openai: 'OpenAI',
  chatgpt: 'ChatGPT', aws: 'AWS', dhl: 'DHL', ups: 'UPS', usps: 'USPS',
  hsbc: 'HSBC', nab: 'NAB', anz: 'ANZ', bpay: 'BPAY', ato: 'ATO', ing: 'ING',
};

const brandName = (token: string): string =>
  BRAND_CASING[token] ?? token.charAt(0).toUpperCase() + token.slice(1);

const BAND_ORDER: Band[] = ['clean', 'caution', 'suspicious', 'danger'];
export const bandRank = (b: Band): number => BAND_ORDER.indexOf(b);
export const higherBand = (a: Band, b: Band): Band => (bandRank(a) >= bandRank(b) ? a : b);

/**
 * Somebody has already positively identified this.
 *
 * This is the one conclusion that is not an inference. A blocklist entry or a
 * Web Risk match is a report from an organisation that looked at this exact
 * thing and classified it. Pagida's own opinion is not relevant next to that,
 * in either direction, which is precisely why this conclusion also survives a
 * user's "mark as safe".
 */
const confirmedByIntelligence: ConclusionRule = ({ signals }) => {
  const confirmed = signals.filter((s) => s.certainty === 'confirmed' && s.weight > 0);
  if (confirmed.length === 0) return null;
  return {
    id: 'confirmed_threat_intelligence',
    title: 'This site is on a list of confirmed attacks',
    detail: confirmed.length === 1 && confirmed[0]
      ? confirmed[0].detail
      : 'More than one independent threat-intelligence source has this site recorded as malicious.',
    floor: 'danger',
    because: confirmed.map((s) => s.id),
  };
};

/**
 * The credential-theft shape.
 *
 * A sign-in form carrying a brand's name, on a domain that brand does not own.
 * Each half is unremarkable: brands are named on pages all the time, and
 * password boxes are everywhere. Together, on a domain with no relationship to
 * the brand, there is no innocent reading.
 *
 * The guard that keeps the false-positive rate at zero is `BRAND_DOMAINS`:
 * this cannot fire on the brand's own site, or on any of its known domains.
 */
const brandCredentialHarvest: ConclusionRule = ({ evidence: e }) => {
  const dom = e.dom;
  if (!dom || !asksForSecret(e)) return null;
  const claim = falseClaims(e)[0];
  if (!claim) return null;

  const { registrableDomain } = parseHost(e.hostname);
  if (BRAND_DOMAINS.has(registrableDomain)) return null;
  // A top-10k site naming another brand is, overwhelmingly, a partner or a
  // social sign-in. It only becomes this conclusion if the password leaves.
  if (isWellKnown(registrableDomain) && !postsToStranger(e)) return null;

  const brand = brandName(claim.brand);
  const because = ['compound_impersonation_credential_form'];
  const what = dom.asksSeedPhrase ? 'wallet recovery phrase' : dom.asksCard && !dom.hasPasswordField ? 'card details' : `${brand} password`;

  // Posting the password to a third party removes the last doubt.
  if (postsToStranger(e)) {
    because.push('cross_origin_password_form');
    return {
      id: 'credential_theft',
      title: `This is a fake ${brand} sign-in page`,
      detail: `The page presents itself as ${brand}, it is served from ${registrableDomain}, and the password box submits to a third site. That is credential theft, not a design quirk.`,
      floor: 'danger',
      because,
    };
  }

  if (claim.how === 'fingerprint') {
    because.push('copied_sign_in_page');
    return {
      id: 'copied_sign_in_page',
      title: `This is a copy of ${brand}'s sign-in page`,
      detail: `The page is built exactly like ${brand}'s own sign-in page, but it is on ${registrableDomain}. Anything you type goes to whoever runs ${registrableDomain}, not to ${brand}.`,
      floor: 'danger',
      because,
    };
  }

  return {
    id: 'brand_impersonation_login',
    title: `A ${brand} sign-in page on a domain ${brand} does not own`,
    detail: `${registrableDomain} is asking for your ${what}. Whoever receives it will not be ${brand}.`,
    floor: 'danger',
    because,
  };
};

/**
 * Brand-new domain, already asking for credentials.
 *
 * Phishing infrastructure is disposable and the median phishing domain is days
 * old. A legitimate service asking for your password has, essentially without
 * exception, existed for longer than a fortnight.
 *
 * Held to `suspicious` rather than `danger` on its own: a genuinely new startup
 * with a login page is rare, but it exists, and it does not deserve a full
 * interruption without something else agreeing.
 */
const freshDomainCredentialForm: ConclusionRule = ({ evidence: e }) => {
  const age = e.domainAgeDays;
  if (age === undefined || age === null || age > 30) return null;
  if (!e.dom || !asksForPassword(e)) return null;
  // A new official site (a gov.in portal launched last week) is new by nature,
  // and nobody but a government can register under that ending.
  const here = parseHost(e.hostname).registrableDomain;
  if (isWellKnown(here) || BRAND_DOMAINS.has(here) || isOfficialDomain(here)) return null;
  // You have used it on several days over two weeks: new to the world, not to you.
  if (e.history?.trusted) return null;

  const floor: Band = postsToStranger(e) || e.dom.brandTokens.length > 0
    ? 'danger'
    : 'suspicious';

  return {
    id: 'fresh_domain_credential_form',
    title: `A ${age}-day-old domain is asking for your password`,
    detail: `This domain was registered ${age} days ago. Services you already have an account with are older than that, by definition.`,
    floor,
    because: ['compound_new_domain_credential_form'],
  };
};

/**
 * The password leaves the site you are looking at.
 *
 * Worth a conclusion of its own even with no brand involved, because there is
 * almost no legitimate reason for it. The exceptions, federated sign-in,
 * hosted checkout, send you to the other origin rather than posting your
 * password across from a form you are already typing into.
 */
const passwordLeavesTheSite: ConclusionRule = ({ evidence: e }) => {
  const dom = e.dom;
  // No visibility test here: a password form wired to a stranger is the
  // attack whether or not it has been revealed yet.
  if (!dom?.hasPasswordField || !postsToStranger(e)) return null;
  if (dom.brandTokens.length > 0 && asksForPassword(e)) return null; // covered, more strongly, above
  // A top-10k site or a brand's own domain posting to its own sign-in service
  // on another domain (index.hu to its account service) is single sign-on,
  // not theft. A hacked top site sending passwords to a relay is caught by the
  // relay rule, which names where the data goes.
  const here = parseHost(e.hostname).registrableDomain;
  if (isWellKnown(here) || BRAND_DOMAINS.has(here)) return null;

  const target = dom.passwordFormActions[0];
  let where = 'another site';
  try {
    if (target) where = parseHost(new URL(target).hostname).registrableDomain || where;
  } catch { /* unparseable action; the generic wording is fine */ }

  return {
    id: 'password_posted_offsite',
    title: 'Your password would be sent to a different site',
    detail: `The password box on this page submits to ${where}, not to the site you are on. Real sign-in pages do not do this.`,
    floor: 'danger',
    because: ['cross_origin_password_form'],
  };
};

/**
 * Insecure credential submission.
 *
 * A password travelling over plain http can be read by anyone on the network
 * path. This is not necessarily an attack. It is sometimes just an
 * embarrassingly old site, so it caps at `suspicious` and says so honestly.
 */
const passwordOverPlainHttp: ConclusionRule = ({ evidence: e }) => {
  const dom = e.dom;
  if (!dom || !asksForPassword(e)) return null;
  if (!dom.insecurePasswordFormAction && e.protocol !== 'http:') return null;
  return {
    id: 'password_in_the_clear',
    title: 'This password would travel unencrypted',
    detail: 'The sign-in form on this page is not protected in transit. Anyone sharing this network can read what you type.',
    floor: 'suspicious',
    because: ['insecure_password_form', 'http_page_with_password'],
  };
};

/**
 * A page dressed as a brand, on an address with a second tell, but no login
 * form (yet). Fake Roblox profiles, fake "update Adobe" PDF viewers, crypto
 * giveaways. Held at `suspicious`: enough for Iris to speak, with a reason she
 * can say in one sentence.
 */
const brandLookalikePage: ConclusionRule = ({ evidence: e, fired }) => {
  const dom = e.dom;
  const claim = falseClaims(e)[0];
  if (!dom || !claim) return null;
  const { registrableDomain } = parseHost(e.hostname);
  if (BRAND_DOMAINS.has(registrableDomain) || isWellKnown(registrableDomain)) return null;
  const young = e.domainAgeDays !== undefined && e.domainAgeDays !== null && e.domainAgeDays <= 30;
  const tells = ['hotlinked_brand_favicon', 'brand_in_subdomain', 'brand_in_domain_name', 'brand_typosquat', 'brand_confusable_domain',
    'brand_on_foreign_tld', 'document_lure', 'borrowed_brand_logo', 'copied_sign_in_page', 'wordpress_internal_path',
    'wordpress_upload_path', 'free_hosting_subdomain']
    .filter((id) => fired.has(id));
  if (!young && tells.length === 0) return null;
  const brand = brandName(claim.brand);
  return {
    id: 'brand_lookalike_page',
    title: `This page is dressed up as ${brand}, but it is not ${brand}`,
    detail: young
      ? `It uses ${brand} branding on ${registrableDomain}, a domain registered ${e.domainAgeDays} days ago. ${brand} does not use it.`
      : `It uses ${brand} branding on ${registrableDomain}, a site ${brand} does not own, and it shows other signs of a fake: ${tells.length} of them.`,
    floor: 'suspicious',
    because: ['brand_content_mismatch', ...tells],
  };
};

/**
 * A copy of a site this person really signs in to.
 *
 * The icon of a site they have signed in to before, on a site they have not,
 * asking for a password. Covers every bank, council and company sign-in page
 * the brand list will never know. A second tell (a brand-new domain, the
 * password leaving for a third site, a free host) makes it a full warning;
 * the icon alone stops at suspicious, because some organisations run more
 * than one domain and Pagida may only have seen one of them.
 */
const copyOfYourSignIn: ConclusionRule = ({ evidence: e, fired }) => {
  const dom = e.dom;
  const theirs = dom?.copiesSignInSite;
  if (!dom || !theirs || !asksForPassword(e)) return null;
  const { registrableDomain } = parseHost(e.hostname);
  if (BRAND_DOMAINS.has(registrableDomain) || isWellKnown(registrableDomain)) return null;
  const young = e.domainAgeDays !== undefined && e.domainAgeDays !== null && e.domainAgeDays <= 30;
  const second = young || postsToStranger(e) || fired.has('free_hosting_subdomain');
  return {
    id: 'copy_of_your_sign_in',
    title: `This looks like ${theirs}, where you sign in, but it is a different site`,
    detail: `You have signed in at ${theirs} before. This page uses the same icon and asks for your password, but it is on ${registrableDomain}. Go to ${theirs} yourself instead.`,
    floor: second ? 'danger' : 'suspicious',
    because: ['copies_your_sign_in_site'],
  };
};

/**
 * A sign-in page on a free website host.
 *
 * Banks, email providers, shops and governments run their sign-in pages on
 * their own domains. A page on pages.dev or vercel.app that asks for a
 * password is a personal project at best, and in the November 2026 benchmark
 * it was the single largest group of missed attacks: regional banks and
 * telcos no brand list covers (Banco de la Nación, DKB, Orange, SwissPass).
 * Suspicious, not danger: developers do sign in to their own test apps there.
 */
const signInOnFreeHost: ConclusionRule = ({ evidence: e, fired }) => {
  if (!e.dom || !asksForPassword(e) || !fired.has('free_hosting_subdomain')) return null;
  const { registrableDomain, suffix } = parseHost(e.hostname);
  if (BRAND_DOMAINS.has(registrableDomain)) return null;
  const host = freeHostOf(e.hostname, suffix, registrableDomain) ?? suffix;
  return {
    id: 'sign_in_on_free_host',
    title: `A sign-in page on ${host}, a free website host`,
    detail: `This page asks for a password, but anyone can publish a page on ${host} in minutes. Banks, email providers and shops do not put their sign-in pages there. If you meant to sign in somewhere, go to that site yourself.`,
    floor: 'suspicious',
    because: ['free_hosting_subdomain'],
  };
};

/**
 * You opened this from an email Pagida already warned about. The page may look
 * clean on its own (a fresh copy no list knows yet), but it inherits the
 * email's verdict: that is the context a page check alone never has.
 */
const fromWarnedEmail: ConclusionRule = ({ evidence: e }) => {
  const a = e.arrival;
  if (!a?.fromEmail || !a.emailWarned) return null;
  const { registrableDomain } = parseHost(e.hostname);
  const secret = asksForSecret(e);
  // A link to youtube.com in a scam email does not make YouTube a scam. A
  // stranger's Google Doc or Form, though, is the scam's next step.
  const ownedItem = historyKey(`https://${e.hostname}${e.path}`)?.includes('#') ?? false;
  if ((BRAND_DOMAINS.has(registrableDomain) || isWellKnown(registrableDomain)) && !secret && !ownedItem) return null;
  return {
    id: 'from_warned_email',
    title: 'You opened this from an email I warned you about',
    detail: secret
      ? 'The email that sent you here looked like a scam, and this page asks for something private. Do not type anything here. If the email was about an account, go to that service yourself.'
      : 'The email that sent you here looked like a scam. This page is where it wanted you to go, so be careful with anything it asks you to do or download.',
    floor: secret ? 'danger' : 'suspicious',
    because: ['arrived_from_warned_email'],
  };
};

/** One-signal conclusions: offline evidence specific enough to name the attack. */
const namedAttack = (signalId: string, id: string, title: string, floor: Band): ConclusionRule =>
  ({ signals }) => {
    const s = signals.find((x) => x.id === signalId);
    if (!s) return null;
    return { id, title, detail: s.detail, floor, because: [signalId] };
  };

const clickFixAttack = namedAttack('clickfix_command', 'clickfix_attack', 'This page is trying to make you run a command', 'danger');
const seedPhraseTheft = namedAttack('seed_phrase_request', 'seed_phrase_theft', 'This page wants your crypto recovery phrase', 'danger');
const secretToRelay = namedAttack('secret_sent_to_relay', 'secret_to_relay', 'What you type here goes to a stranger', 'danger');
const techSupportScam = namedAttack('fake_virus_warning', 'tech_support_scam', 'This is a fake virus warning', 'danger');
const fakePopup = namedAttack('fake_popup_window', 'browser_in_browser', 'That sign-in window is fake', 'danger');
const passwordForm = namedAttack('password_in_online_form', 'password_in_online_form', 'This form wants your password. Forms are never the place for one', 'danger');

/** On the local list. Danger when the page is also asking for something or claiming a brand. */
const onLocalBlocklist: ConclusionRule = ({ evidence: e, signals }) => {
  const s = signals.find((x) => x.id === 'local_blocklist_match');
  if (!s) return null;
  const serious = asksForSecret(e) || falseClaims(e).length > 0;
  return {
    id: 'local_blocklist',
    title: 'This site is on a list of phishing sites',
    detail: s.detail,
    floor: serious ? 'danger' : 'suspicious',
    because: ['local_blocklist_match'],
  };
};

/** Order matters only for display; the floor is the maximum across all of them. */
const CONCLUSION_RULES: ConclusionRule[] = [
  confirmedByIntelligence,
  brandCredentialHarvest,
  passwordLeavesTheSite,
  freshDomainCredentialForm,
  passwordOverPlainHttp,
  brandLookalikePage,
  copyOfYourSignIn,
  signInOnFreeHost,
  onLocalBlocklist,
  clickFixAttack,
  seedPhraseTheft,
  secretToRelay,
  techSupportScam,
  fakePopup,
  passwordForm,
  fromWarnedEmail,
];

export function concludeFrom(evidence: PageEvidence, signals: Signal[]): Conclusion[] {
  const context: ConclusionContext = {
    evidence,
    signals,
    fired: new Set(signals.map((s) => s.id)),
  };
  const found: Conclusion[] = [];
  for (const rule of CONCLUSION_RULES) {
    const c = rule(context);
    if (c) found.push(c);
  }
  return found.sort((a, b) => bandRank(b.floor) - bandRank(a.floor));
}

/** The band no conclusion will allow the verdict to fall below. */
export function floorFrom(conclusions: Conclusion[]): Band {
  return conclusions.reduce<Band>((f, c) => higherBand(f, c.floor), 'clean');
}
