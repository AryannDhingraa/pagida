/**
 * The site report — everything Pagida can find out about a domain.
 *
 * This is the piece that answers "but what *is* this site?". Every source runs
 * in parallel and every one is independently allowed to fail, so a slow or
 * unreachable provider costs you one row rather than the whole report.
 *
 * Seven public sources, none of which needs a key or an account. What leaves
 * the machine is a domain name and an IP address — never the page you are on.
 */
import type { Verdict } from '../core/types.js';
import { parseHost } from '../core/util/domain.js';
import { isWellKnown } from '../core/data/allowlist.js';
import { lookupRegistration, type RegistrationFacts } from './rdap.js';
import { lookupDns, type DnsFacts } from './dns.js';
import { lookupHost, type HostFacts } from './netinfo.js';
import { lookupCerts, type CertFacts } from './certs.js';
import { lookupIp, type IpFacts } from './ipinfo.js';
import { lookupArchive, type ArchiveFacts } from './wayback.js';
import { lookupMalware, type MalwareFacts } from './urlhaus.js';

/**
 * What the page itself is made of, gathered by the content script.
 *
 * This costs no network call and no privacy, and it answers questions the
 * external sources cannot: what the site is built with, who it loads code
 * from, and whether it is asking for credentials.
 */
export interface TechFacts {
  generator?: string;
  title?: string;
  description?: string;
  /** Distinct third-party hosts the page loads code from. */
  externalScriptHosts?: string[];
  frameworks?: string[];
  formCount?: number;
  hasPasswordField?: boolean;
  externalLinkHosts?: string[];
  /** A rough sense of page weight. */
  resourceCounts?: { scripts: number; images: number; iframes: number };
}

export interface SiteReport {
  url: string;
  hostname: string;
  registrableDomain: string;
  protocol: string;
  wellKnown: boolean;
  registration?: RegistrationFacts;
  dns?: DnsFacts;
  host?: HostFacts;
  certs?: CertFacts;
  ip?: IpFacts;
  archive?: ArchiveFacts;
  malware?: MalwareFacts;
  tech?: TechFacts;
  verdict?: Verdict;
  generatedAt: number;
  /** Sources that did not answer, so the UI can say so rather than stay blank. */
  unavailable: string[];
}

export async function buildReport(
  url: string,
  verdict?: Verdict,
  tech?: TechFacts,
): Promise<SiteReport | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const hostname = parsed.hostname.toLowerCase();
  const { registrableDomain } = parseHost(hostname);
  const unavailable: string[] = [];

  const [registration, dns, certs, archive, malware] = await Promise.all([
    lookupRegistration(hostname),
    lookupDns(hostname, registrableDomain),
    lookupCerts(registrableDomain),
    lookupArchive(registrableDomain),
    lookupMalware(hostname),
  ]);

  if (!registration) unavailable.push('registration');
  if (!dns || Object.keys(dns).length === 0) unavailable.push('dns');
  if (!certs) unavailable.push('certificates');
  if (!archive) unavailable.push('archive');
  if (!malware) unavailable.push('malware list');

  // The address-based lookups can only run once DNS has answered.
  let host: HostFacts | undefined;
  let ip: IpFacts | undefined;
  const address = dns?.ipv4?.[0];
  if (address) {
    [host, ip] = await Promise.all([lookupHost(address), lookupIp(address)]);
    if (!host) unavailable.push('open ports');
    if (!ip) unavailable.push('network owner');
  } else {
    unavailable.push('open ports', 'network owner');
  }

  return {
    url,
    hostname,
    registrableDomain,
    protocol: parsed.protocol,
    wellKnown: isWellKnown(registrableDomain),
    registration,
    dns,
    host,
    certs,
    ip,
    archive,
    malware,
    tech,
    verdict,
    generatedAt: Date.now(),
    unavailable,
  };
}
