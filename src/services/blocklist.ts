/**
 * The big local blocklist: Phishing.Database's active phishing domains
 * (MIT licence, ~390,000 domains), checked entirely on the machine.
 *
 * Downloaded at most once a day (about 3.7 MB compressed), turned into a
 * sorted array of 64-bit fingerprints (about 3 MB) and kept in IndexedDB.
 * A lookup is a binary search: no network, no domain ever sent anywhere.
 *
 * The raw list is not safe to trust blindly. In November 2026 it contained 17
 * of the world's top 10,000 domains, among them amazon.ie, gravatar.com and
 * nflxvideo.net (Netflix's video servers). So a hit on a brand domain, a top
 * site or a shared host is ignored here, before it can become a verdict.
 */
import { parseHost } from '../core/util/domain.js';
import { isSharedHost } from '../core/util/network.js';
import { BRAND_DOMAINS, isWellKnown } from '../core/data/index.js';

const SOURCE = 'https://raw.githubusercontent.com/Phishing-Database/Phishing.Database/master/phishing-domains-ACTIVE.txt';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DB = 'pagida';
const STORE = 'blocklist';

let loaded: Uint32Array | null = null;
let loadedAt = 0;

/** Two independent 32-bit FNV-1a hashes = one 64-bit fingerprint. */
export function fingerprint(domain: string): [number, number] {
  let a = 0x811c9dc5; let b = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < domain.length; i++) {
    const c = domain.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193 ^ 0x5bd1e995) >>> 0;
  }
  return [a >>> 0, b >>> 0];
}

/** Build the sorted pair array from the list's text. Exported for tests. */
export function buildIndex(text: string): Uint32Array {
  const pairs: Array<[number, number]> = [];
  for (const line of text.split('\n')) {
    const d = line.trim().toLowerCase();
    if (!d || d.startsWith('#') || !d.includes('.')) continue;
    pairs.push(fingerprint(d));
  }
  pairs.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const out = new Uint32Array(pairs.length * 2);
  pairs.forEach(([h, l], i) => { out[i * 2] = h; out[i * 2 + 1] = l; });
  return out;
}

export function contains(index: Uint32Array, domain: string): boolean {
  const [h, l] = fingerprint(domain);
  let lo = 0; let hi = index.length / 2 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const mh = index[mid * 2]!; const ml = index[mid * 2 + 1]!;
    if (mh === h && ml === l) return true;
    if (mh < h || (mh === h && ml < l)) lo = mid + 1; else hi = mid - 1;
  }
  return false;
}

/**
 * Is this host on the list? Checks the full hostname and each parent up to
 * the registrable domain, and ignores hits that would accuse a brand, a top
 * site or a shared host.
 */
export function listed(index: Uint32Array, hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  const { registrableDomain, sld } = parseHost(host);
  if (BRAND_DOMAINS.has(registrableDomain) || isWellKnown(registrableDomain)) return false;
  if (isSharedHost(host, sld, false) && host === registrableDomain) return false;
  const labels = host.split('.');
  const regLabels = registrableDomain.split('.').length;
  for (let i = 0; i + regLabels <= labels.length; i++) {
    const candidate = labels.slice(i).join('.');
    if (contains(index, candidate) || contains(index, `www.${candidate}`)) {
      // A hit on a shared platform's own registrable domain says nothing about this tenant.
      if (candidate === registrableDomain && isSharedHost(host, sld, false)) return false;
      return true;
    }
  }
  return false;
}

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readStored(): Promise<{ index: Uint32Array; at: number } | null> {
  const d = await db();
  return new Promise((resolve) => {
    const req = d.transaction(STORE).objectStore(STORE).get('current');
    req.onsuccess = () => {
      const v = req.result as { buf: ArrayBuffer; at: number } | undefined;
      resolve(v ? { index: new Uint32Array(v.buf), at: v.at } : null);
    };
    req.onerror = () => resolve(null);
  });
}

async function writeStored(index: Uint32Array, at: number): Promise<void> {
  const d = await db();
  await new Promise<void>((resolve) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ buf: index.buffer, at }, 'current');
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/** The index, loading it from IndexedDB once per worker life. */
export async function getIndex(): Promise<Uint32Array | null> {
  if (loaded) return loaded;
  try {
    const stored = await readStored();
    if (stored) { loaded = stored.index; loadedAt = stored.at; }
  } catch { /* no IndexedDB: the list just is not used */ }
  return loaded;
}

/** Download a fresh copy if ours is older than a day. Safe to call often. */
let refreshing: Promise<void> | null = null;
export function refreshBlocklist(force = false): Promise<void> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      await getIndex();
      if (!force && loaded && Date.now() - loadedAt < MAX_AGE_MS) return;
      const res = await fetch(SOURCE, { cache: 'no-cache', credentials: 'omit' });
      if (!res.ok) return;
      const index = buildIndex(await res.text());
      if (index.length < 2000) return; // a broken download, keep the old copy
      loaded = index; loadedAt = Date.now();
      await writeStored(index, loadedAt);
    } catch { /* offline: keep what we have */ } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export function blocklistSize(): number {
  return loaded ? loaded.length / 2 : 0;
}
