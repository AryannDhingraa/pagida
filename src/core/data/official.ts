/**
 * Domain endings only governments and universities can register.
 *
 * Nobody can buy a name under gov.au, gov.uk or go.jp: the registry checks
 * that the applicant is a government body. So a site there is official even
 * if it went live this morning and is in no top-sites list. That matters for
 * people abroad, who use another country's official sites that Pagida has
 * never seen ranked, and for new official sites, which are by definition new.
 *
 * What that buys: an official site is never judged by guesswork (being new,
 * an odd-looking address). It is NOT treated as trusted: government and
 * university servers and mailboxes are hacked all the time, and the 2025
 * phishing corpus has mail sent from real gov.uk, gob.ar and ac.in accounts.
 * So every named reason (a fake brand sign-in page, a password sent to a
 * stranger, a scam email) still applies to them, and so do the scam lists.
 *
 * Only endings whose registration is actually restricted are here. Open
 * endings that merely sound official (gov.ng style look-alikes on open
 * registries, or `govt` as a word in a .com) are not.
 */
const OFFICIAL_SUFFIXES: readonly string[] = [
  // Governments
  'gov', 'mil', 'gov.au', 'gov.uk', 'gov.nz', 'govt.nz', 'gc.ca', 'gouv.fr', 'gov.ie',
  'gov.in', 'nic.in', 'gov.sg', 'gov.my', 'go.jp', 'go.kr', 'gov.cn', 'gov.tw', 'gov.hk',
  'gov.br', 'gob.mx', 'gob.es', 'gob.ar', 'gob.cl', 'gob.pe', 'gov.co', 'gov.za', 'gv.at',
  'admin.ch', 'gov.it', 'gov.pl', 'gov.pt', 'gov.gr', 'gov.il', 'gov.ae', 'gov.sa',
  'gov.ph', 'go.id', 'go.th', 'gov.vn', 'gov.bd', 'gov.pk', 'gov.lk', 'gov.np', 'gov.tr',
  // Universities
  'edu', 'edu.au', 'ac.uk', 'ac.nz', 'ac.jp', 'ac.in', 'edu.sg',
];

/** True when the domain sits under an ending only official bodies can register. */
export function isOfficialDomain(domain: string): boolean {
  const d = domain.toLowerCase().replace(/\.$/, '');
  return OFFICIAL_SUFFIXES.some((s) => d === s || d.endsWith(`.${s}`));
}
