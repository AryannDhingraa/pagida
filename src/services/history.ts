/**
 * Where to keep the site memory so it says nothing to anyone who reads it.
 *
 * Every entry is filed under a keyed hash (HMAC-SHA-256) of the site or item,
 * not its name. The key is made once on this computer as a non-extractable
 * CryptoKey and kept in IndexedDB: the browser will use it to hash, but will
 * not hand its bytes to anyone, including Pagida's own code or DevTools. So
 * the stored list is a set of random-looking strings. Pagida can ask "have I
 * seen bendigobank.com.au?" by hashing the name again; nobody can ask "which
 * sites are in here?".
 *
 * What this does not do: stop software that already runs as you on this
 * computer from asking the same question about a guess, one site at a time.
 * Nothing in a browser extension can.
 */
import { familiarity, historyKey, noteVisit, prune, type Familiarity, type HistoryEntry } from '../core/history.js';

const DB = 'pagida-history';
const STORE = 'key';
let keyPromise: Promise<CryptoKey> | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadKey(): Promise<CryptoKey> {
  const db = await openDb();
  const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => {
    const r = db.transaction(STORE).objectStore(STORE).get('hmac');
    r.onsuccess = () => resolve(r.result as CryptoKey | undefined);
    r.onerror = () => reject(r.error);
  });
  if (existing) { db.close(); return existing; }
  const key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(key, 'hmac');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return key;
}

const key = (): Promise<CryptoKey> => (keyPromise ??= loadKey().catch((e) => { keyPromise = null; throw e; }));

async function hashOf(name: string): Promise<string> {
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await key(), new TextEncoder().encode(name)));
  return Array.from(sig.slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function loadAll(): Promise<Record<string, HistoryEntry>> {
  const { siteHistory } = await chrome.storage.local.get('siteHistory');
  return (siteHistory ?? {}) as Record<string, HistoryEntry>;
}

/** What Pagida knows of this person's history with the site or item at this address. */
export async function familiarityOf(url: string): Promise<Familiarity | undefined> {
  const name = historyKey(url);
  if (!name) return undefined;
  try {
    return familiarity((await loadAll())[await hashOf(name)], Date.now());
  } catch { return undefined; }
}

/** Remember a visit, after the page was judged. A warning is remembered for good. */
export async function rememberVisit(url: string, warned: boolean): Promise<void> {
  const name = historyKey(url);
  if (!name) return;
  try {
    const h = await hashOf(name);
    const all = await loadAll();
    all[h] = noteVisit(all[h], Date.now(), warned);
    const keys = Object.keys(all).length;
    await chrome.storage.local.set({ siteHistory: keys > 5000 || Math.random() < 0.02 ? prune(all, Date.now()) : all });
  } catch { /* storage or crypto unavailable: no memory, no harm */ }
}

/** Wipe the memory and its key, so even old copies of the list can never be matched again. */
export async function forgetHistory(): Promise<void> {
  await chrome.storage.local.remove('siteHistory');
  keyPromise = null;
  await new Promise<void>((resolve) => {
    const r = indexedDB.deleteDatabase(DB);
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
}

export async function historySize(): Promise<number> {
  return Object.keys(await loadAll()).length;
}
