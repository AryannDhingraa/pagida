/**
 * Hosts that live on the user's own network or machine.
 *
 * A router at 192.168.1.1, a NAS, Home Assistant on homeassistant.local, a dev
 * server on localhost:3000, an intranet at http://jira/. v3 scored these as a
 * raw IP with no HTTPS and a password box, which is 75 points and "Do not type
 * your password here" on the user's own router.
 *
 * Phishing does not reach people through their own LAN, so these get no URL
 * heuristics and, just as important, are never sent to RDAP or the Pagida
 * service. An internal hostname is exactly what a company does not want leaking.
 */
const PRIVATE_SUFFIXES = ['.local', '.localhost', '.lan', '.home', '.internal', '.intranet', '.corp', '.home.arpa', '.test', '.example', '.invalid'];

export function isPrivateHost(rawHost: string): boolean {
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (host === 'localhost') return true;
  if (!host.includes('.') && !host.includes(':')) return true; // single-label intranet name
  if (PRIVATE_SUFFIXES.some((s) => host.endsWith(s))) return true;

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127) || a === 0;
  }
  if (host.includes(':')) {
    return host === '::1' || /^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host);
  }
  return false;
}

/**
 * Hosts shared by many unrelated tenants, where one phishing page on the host
 * says nothing about the next page on it. A host-level blocklist match is only
 * meaningful on a host one party controls.
 */
const SHARED_HOSTS = new Set([
  'docs.google.com', 'drive.google.com', 'sites.google.com', 'forms.gle', 'storage.googleapis.com',
  'firebasestorage.googleapis.com', 'script.google.com', 'forms.office.com', 'onedrive.live.com',
  '1drv.ms', 'www.dropbox.com', 'dl.dropboxusercontent.com', 'ipfs.io', 'dweb.link', 'cloudflare-ipfs.com',
  'gateway.pinata.cloud', 'linktr.ee', 'qr-codes.io', 'form.jotform.com', 'www.jotform.com',
  'docs.zoho.com', 'forms.zohopublic.com', 'www.canva.com', 'canva.link', 'notion.site', 'web.archive.org',
  'd33wubrfki0l68.cloudfront.net', 'raw.githubusercontent.com', 'gist.github.com', 'github.com',
  'bit.ly', 't.co', 'tinyurl.com', 'is.gd', 'rb.gy', 't.ly', 'cutt.ly', 'wetransfer.com', 'we.tl',
  'www.figma.com', 'www.wix.com', 'www.weebly.com', 'www.google.com', 'translate.goog',
]);

/**
 * True when the hostname is a platform rather than a site: a public suffix in
 * its own right (s3.us-east-2.amazonaws.com), or a known shared host.
 */
export function isSharedHost(hostname: string, sld: string, wellKnownOrBrand: boolean): boolean {
  if (!sld) return true;
  if (SHARED_HOSTS.has(hostname)) return true;
  // www.example.com and example.com on a well-known or brand domain: the owner
  // is big enough that a host-level match is far likelier a hosted user page.
  return wellKnownOrBrand;
}
