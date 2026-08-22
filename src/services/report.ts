/**
 * The site report — everything Pagida can find out about a domain.
 *
 * This is the piece that answers "but what *is* this site?". Each source is
 * fetched in parallel and each is independently allowed to fail, so a slow or
 * blocked provider costs you one row rather than the whole report.
 */
import type { Verdict } from '../core/types.js';
import { parseHost } from '../core/util/domain.js';
import { isWellKnown } from '../core/data/allowlist.js';
import { lookupRegistration, type RegistrationFacts } from './rdap.js';
import { lookupDns, type DnsFacts } from './dns.js';
import { lookupHost, type HostFacts } from './netinfo.js';
import { lookupCerts, type CertFacts } from './certs.js';

export interface SiteReport {
  url: string;
  hostname: string;
  registrableDomain: string;
  protocol: string;
  /** True when this is one of the top domains Pagida ships an allowlist of. */
  wellKnown: boolean;
  registration?: RegistrationFacts;
  dns?: DnsFacts;
  host?: HostFacts;
  certs?: CertFacts;
  verdict?: Verdict;
  generatedAt: number;
  /** Sources that did not answer, so the UI can say so rather than stay blank. */
  unavailable: string[];
}

export async function buildReport(url: string, verdict?: Verdict): Promise<SiteReport | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const { registrableDomain } = parseHost(parsed.hostname);
  const unavailable: string[] = [];

  const [registration, dns, certs] = await Promise.all([
    lookupRegistration(parsed.hostname),
    lookupDns(registrableDomain),
    lookupCerts(registrableDomain),
  ]);

  if (!registration) unavailable.push('registration');
  if (!dns || Object.keys(dns).length === 0) unavailable.push('dns');
  if (!certs) unavailable.push('certificates');

  // The host lookup needs an address, so it can only run once DNS has answered.
  let host: HostFacts | undefined;
  const ip = dns?.ipv4?.[0];
  if (ip) {
    host = await lookupHost(ip);
    if (!host) unavailable.push('host');
  } else {
    unavailable.push('host');
  }

  return {
    url,
    hostname: parsed.hostname.toLowerCase(),
    registrableDomain,
    protocol: parsed.protocol,
    wellKnown: isWellKnown(registrableDomain),
    registration,
    dns,
    host,
    certs,
    verdict,
    generatedAt: Date.now(),
    unavailable,
  };
}
