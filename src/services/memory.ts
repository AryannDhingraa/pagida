/**
 * Lookup memory: remember Google's answer about a site, so the Pagida service
 * is asked once a day per site instead of on every visit.
 *
 * What is remembered is the remote answer only, never Pagida's verdict. The
 * page checks and the local blocklists still run on every visit, so a site
 * that is remembered as clean and then gets hacked is still caught, and
 * catching it wipes the memory.
 *
 * Rules that keep this from letting fakes through:
 *  - Memory is per exact registrable domain. Trusting youtube.com does nothing
 *    for y0utube.com.
 *  - On shared hosts (github.io, vercel.app, docs.google.com) anyone can
 *    publish, so memory is per full hostname and lasts an hour.
 *  - Only clean answers are remembered. A listed answer is never cached as good.
 *  - It lives in chrome.storage, which survives Chrome putting the worker to
 *    sleep. v3 kept its cache in worker memory, which Chrome wipes after about
 *    30 seconds of quiet.
 */
import { parseHost } from '../core/util/domain.js';
import { isSharedHost } from '../core/util/network.js';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const LIMIT = 3000;

interface Entry { at: number; ttl: number }
type Memory = Record<string, Entry>;

function keyFor(hostname: string): { key: string; ttl: number } {
  const { registrableDomain, sld } = parseHost(hostname);
  return isSharedHost(hostname, sld, false)
    ? { key: `h:${hostname}`, ttl: HOUR }
    : { key: `d:${registrableDomain}`, ttl: DAY };
}

async function load(): Promise<Memory> {
  const { lookupMemory } = await chrome.storage.local.get('lookupMemory');
  return (lookupMemory ?? {}) as Memory;
}

/** True when this site was checked and found clean recently enough. */
export async function rememberedClean(hostname: string): Promise<boolean> {
  const { key } = keyFor(hostname);
  const entry = (await load())[key];
  return !!entry && Date.now() - entry.at < entry.ttl;
}

export async function rememberClean(hostname: string): Promise<void> {
  const { key, ttl } = keyFor(hostname);
  const mem = await load();
  mem[key] = { at: Date.now(), ttl };
  const keys = Object.keys(mem);
  if (keys.length > LIMIT) {
    keys.sort((a, b) => mem[a]!.at - mem[b]!.at);
    for (const k of keys.slice(0, keys.length - LIMIT)) delete mem[k];
  }
  await chrome.storage.local.set({ lookupMemory: mem });
}

/** Called when the page itself looks wrong: the next visit asks again. */
export async function forget(hostname: string): Promise<void> {
  const { key } = keyFor(hostname);
  const mem = await load();
  if (!(key in mem)) return;
  delete mem[key];
  await chrome.storage.local.set({ lookupMemory: mem });
}

/** How many times the service was asked versus answered from memory, for the options page. */
export async function bumpLookupStat(kind: 'asked' | 'remembered' | 'skipped'): Promise<void> {
  const { lookupStats } = await chrome.storage.local.get('lookupStats');
  const s = { asked: 0, remembered: 0, skipped: 0, ...(lookupStats ?? {}) };
  s[kind]++;
  await chrome.storage.local.set({ lookupStats: s });
}
