/**
 * Top-level domains that appear in phishing far out of proportion to their size,
 * generally because registration is free or near-free and abuse enforcement is thin.
 *
 * This is a *weak* signal on purpose. Plenty of legitimate sites live on .xyz and
 * .online. It carries a low weight and is only meaningful stacked with others.
 */
export const FREE_TLDS: ReadonlySet<string> = new Set([
  'tk', 'ml', 'ga', 'cf', 'gq',
]);

/** Cheap generic TLDs that top abuse reports but also host real sites. */
export const CHEAP_ABUSE_TLDS: ReadonlySet<string> = new Set([
  'top', 'xyz', 'buzz', 'click', 'link', 'live', 'icu', 'cyou', 'quest',
  'sbs', 'cfd', 'bond', 'casa', 'monster', 'lol', 'mom', 'rest', 'fit',
  'loan', 'download', 'review', 'stream', 'gdn', 'work', 'party', 'date',
  'racing', 'science', 'accountant', 'faith', 'win', 'bid', 'trade', 'cam',
  'wiki', 'host', 'autos', 'beauty', 'hair', 'skin', 'makeup', 'boats',
  'motorcycles', 'yachts', 'homes', 'christmas', 'zip', 'mov',
]);

/** Every TLD we treat as elevated-risk, at either weight. */
export const HIGH_ABUSE_TLDS: ReadonlySet<string> = new Set([
  ...FREE_TLDS, ...CHEAP_ABUSE_TLDS,
]);

/**
 * URL shorteners. Not malicious in themselves, but they hide the destination,
 * which is why they carry a small penalty and a note in the popup rather than
 * a real weight.
 */
export const URL_SHORTENERS: ReadonlySet<string> = new Set([
  'bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'ow.ly', 'is.gd', 'buff.ly',
  'cutt.ly', 'rebrand.ly', 'shorturl.at', 'tiny.cc', 'rb.gy', 'lnkd.in',
  'shorte.st', 'adf.ly', 'bl.ink', 'snip.ly', 'clck.ru', 'trib.al',
  'dub.sh', 'short.io', 'v.gd', 'qr.ae', 'urls.fr', 'soo.gd', 'x.co',
  'lnk.ink', 'lnkd.in', 't.ly', 's.id', 'cutt.us', 'gg.gg', 'me2.do',
  'chilp.it', 'ouo.io', 'linkr.bio', 'zpr.io', 'shrtco.de', 'tny.im',
  'u.to', 'urlz.fr', 'l.ead.me', 'go.ly', 'kutt.it', 'shrturl.co',
]);

/**
 * File extensions that are dangerous to download and are sometimes served
 * directly from a phishing landing page.
 */
export const RISKY_DOWNLOAD_EXTENSIONS: ReadonlySet<string> = new Set([
  'exe', 'scr', 'bat', 'cmd', 'com', 'pif', 'msi', 'jar', 'vbs', 'js',
  'wsf', 'hta', 'ps1', 'apk', 'dmg', 'iso', 'img', 'lnk',
]);
