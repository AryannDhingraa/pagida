/**
 * Who does this page claim to be, and does it own the address?
 *
 * v5 has four independent ways to answer the first question, in falling order
 * of strength: the brand's own sign-in page structure (login fingerprints), the
 * brand's logo or favicon (image fingerprints), the page naming itself (title,
 * heading, logo alt text), and the brand's own asset servers. The last is only
 * counted when the page is also asking for a secret, because plenty of honest
 * pages load an image from a big company's CDN.
 */
import type { PageEvidence } from './types.js';
import { parseHost } from './util/domain.js';
import { BRAND_DOMAINS, domainsForToken, isWellKnown } from './data/index.js';

/** A brand the page claims, and the strongest evidence for it. */
export interface Claim {
  brand: string;
  how: 'fingerprint' | 'logo' | 'name' | 'assets';
}

/** True when the visible page asks for something secret. */
export function asksForSecret(e: PageEvidence): boolean {
  const d = e.dom;
  if (!d) return false;
  const pw = d.hasPasswordField && d.passwordFieldVisible !== false;
  return pw || !!d.asksCard || !!d.asksOneTimeCode || !!d.asksSeedPhrase;
}

export function claims(e: PageEvidence): Claim[] {
  const d = e.dom;
  if (!d) return [];
  const out: Claim[] = [];
  const add = (brand: string, how: Claim['how']) => {
    if (!out.some((c) => c.brand === brand)) out.push({ brand, how });
  };
  for (const b of d.loginFingerprints ?? []) add(b, 'fingerprint');
  for (const b of d.logoBrands ?? []) add(b, 'logo');
  for (const b of d.brandTokens ?? []) add(b, 'name');
  if (asksForSecret(e)) for (const b of d.brandAssets ?? []) add(b, 'assets');
  return out;
}

/** Does this registrable domain legitimately belong to that brand? */
export function owns(registrableDomain: string, brand: string): boolean {
  return domainsForToken(brand).includes(registrableDomain);
}

/** Claims the address does not back up. */
export function falseClaims(e: PageEvidence): Claim[] {
  const { registrableDomain } = parseHost(e.hostname);
  return claims(e).filter((c) => !owns(registrableDomain, c.brand) && domainsForToken(c.brand).length > 0);
}

/** A brand's own domain, or one of the world's top sites. */
export function trustedName(registrableDomain: string): boolean {
  return BRAND_DOMAINS.has(registrableDomain) || isWellKnown(registrableDomain);
}

const BRAND_CASING: Record<string, string> = {
  paypal: 'PayPal', ebay: 'eBay', youtube: 'YouTube', linkedin: 'LinkedIn', github: 'GitHub', gitlab: 'GitLab',
  whatsapp: 'WhatsApp', icloud: 'iCloud', onedrive: 'OneDrive', commbank: 'CommBank', mygov: 'myGov',
  auspost: 'AusPost', openai: 'OpenAI', chatgpt: 'ChatGPT', aws: 'AWS', dhl: 'DHL', ups: 'UPS', usps: 'USPS',
  hsbc: 'HSBC', nab: 'NAB', anz: 'ANZ', ato: 'ATO', capitalone: 'Capital One', trustwallet: 'Trust Wallet',
  cryptocom: 'Crypto.com', blockchaincom: 'Blockchain.com', macquariebank: 'Macquarie Bank', stgeorge: 'St.George',
  bankofmelbourne: 'Bank of Melbourne', usbank: 'U.S. Bank', westernunion: 'Western Union', cashapp: 'Cash App',
  servicensw: 'Service NSW', vicroads: 'VicRoads', agl: 'AGL', jbhifi: 'JB Hi-Fi', bigw: 'BIG W', myob: 'MYOB',
  wetransfer: 'WeTransfer', godaddy: 'GoDaddy', mailchimp: 'Mailchimp', sharefile: 'ShareFile', tmobile: 'T-Mobile',
  riotgames: 'Riot Games', battlenet: 'Battle.net', docusign: 'DocuSign', office365: 'Office 365', xbox: 'Xbox',
  mygovid: 'myGovID', myid: 'myID', internalrevenueservice: 'IRS', hmrc: 'HMRC', govuk: 'GOV.UK', dpd: 'DPD',
  nzpost: 'NZ Post', canadapost: 'Canada Post', postnl: 'PostNL', starlingbank: 'Starling Bank', bestbuy: 'Best Buy',
  qatarairways: 'Qatar Airways', singaporeair: 'Singapore Airlines', virginaustralia: 'Virgin Australia',
  harveynorman: 'Harvey Norman', chemistwarehouse: 'Chemist Warehouse', energyaustralia: 'EnergyAustralia',
  aussiebroadband: 'Aussie Broadband', greatsouthernbank: 'Great Southern Bank', mebank: 'ME Bank', payid: 'PayID',
};

export const brandName = (token: string): string =>
  BRAND_CASING[token] ?? token.charAt(0).toUpperCase() + token.slice(1);
