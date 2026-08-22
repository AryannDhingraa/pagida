/**
 * Domain age via RDAP.
 *
 * RDAP is the modern replacement for WHOIS. rdap.org is a bootstrap service
 * that redirects to whichever registry actually holds the domain, so one
 * endpoint covers everything, with no API key and no account.
 *
 * Privacy note that belongs in the README as much as in the code: this sends
 * the *registrable domain only* — `example.com`, never the full URL, never the
 * path, never the query string. Results are cached for a week because a
 * domain's registration date does not change.
 */
import { parseHost } from '../core/util/domain.js';

const RDAP_ENDPOINT = 'https://rdap.org/domain/';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 4000;

interface RdapEvent { eventAction?: string; eventDate?: string }
interface RdapResponse { events?: RdapEvent[] }

async function readCache(domain: string): Promise<number | null | undefined> {
  const { rdapCache } = await chrome.storage.local.get('rdapCache');
  const hit = (rdapCache ?? {})[domain];
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) return undefined;
  return hit.ageDays;
}

async function writeCache(domain: string, ageDays: number | null): Promise<void> {
  const { rdapCache } = await chrome.storage.local.get('rdapCache');
  const cache = rdapCache ?? {};
  cache[domain] = { ageDays, at: Date.now() };

  // Keep the cache from growing without bound — 2,000 domains is plenty and
  // stays well inside the extension storage quota.
  const keys = Object.keys(cache);
  if (keys.length > 2000) {
    const sorted = keys.sort((a, b) => cache[a].at - cache[b].at);
    for (const k of sorted.slice(0, keys.length - 2000)) delete cache[k];
  }
  await chrome.storage.local.set({ rdapCache: cache });
}

/**
 * Age of the registrable domain in days.
 * Returns `null` when RDAP has no registration date (some ccTLDs don't publish
 * one), and `undefined` when the lookup failed — the caller treats those
 * differently: null means "we asked, there's no answer", undefined means
 * "we don't know", and neither ever produces a signal.
 */
export async function domainAgeDays(hostname: string): Promise<number | null | undefined> {
  const { registrableDomain, isIpLiteral } = parseHost(hostname);
  if (isIpLiteral || !registrableDomain.includes('.')) return undefined;

  const cached = await readCache(registrableDomain);
  if (cached !== undefined) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(RDAP_ENDPOINT + encodeURIComponent(registrableDomain), {
      signal: controller.signal,
      headers: { Accept: 'application/rdap+json' },
    });
    if (!res.ok) {
      // 404 is a real answer: the registry has no record. Cache it as null so
      // we don't re-ask every page load.
      if (res.status === 404) { await writeCache(registrableDomain, null); return null; }
      return undefined;
    }
    const data = (await res.json()) as RdapResponse;
    const registration = data.events?.find(
      (e) => e.eventAction === 'registration' || e.eventAction === 'created',
    );
    if (!registration?.eventDate) {
      await writeCache(registrableDomain, null);
      return null;
    }
    const registered = new Date(registration.eventDate).getTime();
    if (Number.isNaN(registered)) { await writeCache(registrableDomain, null); return null; }

    const ageDays = Math.max(0, Math.floor((Date.now() - registered) / 86_400_000));
    await writeCache(registrableDomain, ageDays);
    return ageDays;
  } catch {
    // Offline, blocked, rate-limited or timed out. Not knowing is fine.
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Full registration record, for the site report.
// ---------------------------------------------------------------------------

export interface RegistrationFacts {
  domain: string;
  /** ISO date the domain was first registered. */
  registered?: string;
  /** ISO date of the most recent change to the registration. */
  lastChanged?: string;
  /** ISO date the registration lapses. A one-year registration is cheap; ten is not. */
  expires?: string;
  registrar?: string;
  /** Registry status flags, e.g. clientTransferProhibited, serverHold. */
  statuses?: string[];
  nameservers?: string[];
  ageDays?: number | null;
}

interface RdapEntity {
  roles?: string[];
  vcardArray?: unknown;
}
interface RdapFull {
  ldhName?: string;
  events?: Array<{ eventAction?: string; eventDate?: string }>;
  status?: string[];
  entities?: RdapEntity[];
  nameservers?: Array<{ ldhName?: string }>;
}

/** Digs the organisation name out of the jCard blob RDAP wraps registrars in. */
function registrarName(entities: RdapEntity[] | undefined): string | undefined {
  const registrar = entities?.find((e) => e.roles?.includes('registrar'));
  const vcard = registrar?.vcardArray;
  if (!Array.isArray(vcard) || vcard.length < 2) return undefined;
  const fields = vcard[1];
  if (!Array.isArray(fields)) return undefined;
  for (const field of fields) {
    if (Array.isArray(field) && (field[0] === 'fn' || field[0] === 'org') && typeof field[3] === 'string') {
      return field[3];
    }
  }
  return undefined;
}

const iso = (d?: string): string | undefined => {
  if (!d) return undefined;
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? undefined : new Date(t).toISOString().slice(0, 10);
};

export async function lookupRegistration(hostname: string): Promise<RegistrationFacts | undefined> {
  const { registrableDomain, isIpLiteral } = parseHost(hostname);
  if (isIpLiteral || !registrableDomain.includes('.')) return undefined;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS + 2000);
  try {
    const res = await fetch(RDAP_ENDPOINT + encodeURIComponent(registrableDomain), {
      signal: controller.signal,
      headers: { Accept: 'application/rdap+json' },
    });
    if (!res.ok) return res.status === 404 ? { domain: registrableDomain } : undefined;
    const data = (await res.json()) as RdapFull;

    const event = (name: string) =>
      data.events?.find((e) => e.eventAction === name)?.eventDate;

    const registered = iso(event('registration') ?? event('created'));
    const ageDays = registered
      ? Math.max(0, Math.floor((Date.now() - new Date(registered).getTime()) / 86_400_000))
      : null;

    return {
      domain: registrableDomain,
      registered,
      lastChanged: iso(event('last changed') ?? event('last update of RDAP database')),
      expires: iso(event('expiration')),
      registrar: registrarName(data.entities),
      statuses: data.status?.slice(0, 8),
      nameservers: data.nameservers?.map((n) => n.ldhName ?? '').filter(Boolean).slice(0, 6),
      ageDays,
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
