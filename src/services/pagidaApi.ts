/**
 * The Pagida service — the paid-for lookups, given away.
 *
 * Some of the best signals in phishing detection sit behind an API key. Asking
 * every user to go and register for one is the same as not having the feature:
 * almost nobody does it, and the people most likely to be phished are the least
 * likely to get through a cloud console.
 *
 * So Pagida runs a small proxy (see proxy/worker.js) that holds the keys, and
 * the extension asks it. Users get the full service for free and never see a
 * key. The keys stay off the client, where anyone could unzip the extension and
 * take them.
 *
 * WHAT LEAVES THE MACHINE
 *
 * A bare domain name — never the full address, never the page, never a
 * referrer. "example.com", not "example.com/account/reset?token=…". The proxy
 * refuses anything containing a path, so a bug here cannot leak a URL even by
 * accident.
 *
 * The install id below is a random string this browser makes up for itself. It
 * is not an account and is tied to nothing: it exists so one runaway client
 * cannot spend the shared daily quota. It is generated locally and never sent
 * anywhere except as a quota counter.
 */

/** The deployed Worker. Overridden at build time via PAGIDA_API_BASE. */
export const API_BASE = 'https://api.pagida.workers.dev';

const TIMEOUT_MS = 4500;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_LIMIT = 400;

export interface ReputationFacts {
  /** The domain appears on Google's threat lists. */
  listed: boolean;
  /** MALWARE, SOCIAL_ENGINEERING, UNWANTED_SOFTWARE. */
  threatTypes: string[];
}

interface CacheEntry extends ReputationFacts {
  at: number;
}

/** A short-lived in-worker cache, so a tab reload is not a second lookup. */
const cache = new Map<string, CacheEntry>();

async function installId(): Promise<string> {
  const { installId: existing } = await chrome.storage.local.get('installId');
  if (typeof existing === 'string' && existing.length > 0) return existing;
  const fresh = crypto.randomUUID();
  await chrome.storage.local.set({ installId: fresh });
  return fresh;
}

/** Strip everything except the hostname, then verify it really is one. */
function domainOnly(hostname: string): string | null {
  const value = hostname.trim().toLowerCase();
  if (!value || value.length > 253) return null;
  if (!/^[a-z0-9.-]+$/.test(value)) return null;
  if (!value.includes('.')) return null;
  return value;
}

export async function lookupReputation(hostname: string): Promise<ReputationFacts | undefined> {
  const domain = domainOnly(hostname);
  if (!domain) return undefined;

  const hit = cache.get(domain);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { listed: hit.listed, threatTypes: hit.threatTypes };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/v1/webrisk?domain=${encodeURIComponent(domain)}`, {
      signal: controller.signal,
      headers: { 'X-Pagida-Install': await installId() },
    });
    // 429 means the shared quota is spent for today. That is not an error the
    // user should ever see — the other sixteen signals carry on without it.
    if (!res.ok) return undefined;

    const data = (await res.json()) as { listed?: boolean; threatTypes?: string[]; error?: string };
    if (data.error || typeof data.listed !== 'boolean') return undefined;

    const facts: ReputationFacts = {
      listed: data.listed,
      threatTypes: Array.isArray(data.threatTypes) ? data.threatTypes.slice(0, 4) : [],
    };

    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(domain, { ...facts, at: Date.now() });
    return facts;
  } catch {
    return undefined; // offline, blocked, or the proxy is down. Not fatal.
  } finally {
    clearTimeout(timer);
  }
}
