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
