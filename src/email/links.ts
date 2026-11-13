/**
 * Undoing redirect wrappers, so the real destination of an email link is the
 * one that gets checked. No dependencies: the webmail script imports this and
 * should stay small.
 */

/** Gmail (/url?q=), Outlook Safe Links (?url=) and Proofpoint URL Defense (?u=). */
export function unwrapLink(href: string): string {
  try {
    const u = new URL(href);
    const host = u.hostname;
    const pick = (k: string) => u.searchParams.get(k);
    if (/(^|\.)google\.[a-z.]+$/.test(host) && u.pathname === '/url') return pick('q') ?? pick('url') ?? href;
    if (host.endsWith('safelinks.protection.outlook.com')) return pick('url') ?? href;
    if (host === 'urldefense.com' || host.endsWith('urldefense.proofpoint.com')) return pick('u') ?? href;
    return href;
  } catch {
    return href;
  }
}
