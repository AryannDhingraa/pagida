/**
 * Pagida's private memory of where you go, and how you got there.
 *
 * Two questions a list of the world's websites cannot answer:
 *  - Have YOU used this site before? A page you have opened on many days over
 *    weeks, without Pagida ever warning, is not judged by guesswork again.
 *    That ends repeat false alarms on the government portal or club site no
 *    top-sites list knows.
 *  - Did you get here from an email? A sign-in page you have never visited,
 *    reached by clicking a link in an email, is the exact shape of phishing.
 *
 * Shared platforms are remembered per item, not per platform. Having opened
 * your team's Google Doc a hundred times says nothing about a Google Doc a
 * stranger sent you this morning, so each document, form, Drive file, Google
 * Site or free-hosted site is its own entry.
 *
 * Pure on purpose: the worker hashes the keys and stores the entries, this
 * decides. See services/history.ts for how the keys are scrambled.
 */
import { parseHost } from './util/domain.js';
import { freeHostOf } from './util/entropy.js';

export interface HistoryEntry {
  /** Day number (days since 1970) of the first visit. */
  first: number;
  /** Day number of the latest visit. */
  last: number;
  /** How many different days it was visited on. */
  days: number;
  /** Pagida warned here at least once. */
  warned: boolean;
}

/** What the page check gets to know, and nothing more. */
export interface Familiarity {
  /** Never seen before (or forgotten). */
  firstVisit: boolean;
  /** Used on enough separate days, over long enough, with no warning ever. */
  trusted: boolean;
  /** Pagida has warned on this site before. */
  warnedBefore: boolean;
}

export const DAY = 24 * 60 * 60 * 1000;
/** A site becomes yours after this many separate days... */
export const TRUST_DAYS = 4;
/** ...spread over at least this long. A burst of visits in one afternoon is not history. */
export const TRUST_SPAN_DAYS = 14;
/** Entries not seen for this long are dropped. */
export const FORGET_AFTER_DAYS = 180;
export const HISTORY_LIMIT = 5000;

export const dayNumber = (ms: number): number => Math.floor(ms / DAY);

/** Platforms where each document, form or page belongs to a different person. */
const PER_ITEM: { host: RegExp; item: RegExp }[] = [
  // docs.google.com/document/d/<id>, /forms/d/e/<id>, /spreadsheets/d/<id>, /presentation/d/<id>
  { host: /^docs\.google\.com$/, item: /^\/(?:a\/[^/]+\/)?(document|spreadsheets|presentation|forms|drawings)\/d\/(?:e\/)?([\w-]{10,})/ },
  { host: /^drive\.google\.com$/, item: /^\/(?:file|drive\/folders|drive\/u\/\d+\/folders)\/(?:d\/)?([\w-]{10,})/ },
  { host: /^sites\.google\.com$/, item: /^\/(view\/[^/]+|[^/]+\/[^/]+)/ },
  { host: /^forms\.office\.com$/, item: /[?&]id=([\w-]{10,})/ },
  { host: /^(?:onedrive\.live\.com|1drv\.ms)$/, item: /^(\/[^?#]*)/ },
  { host: /^(?:www\.)?dropbox\.com$/, item: /^\/(?:s|scl\/fi|sh)\/([\w-]+)/ },
  { host: /^(?:www\.)?(?:jotform\.com|form\.jotform\.com)$/, item: /^\/(\d{6,})/ },
  { host: /^(?:www\.)?canva\.com$/, item: /^\/design\/([\w-]+)/ },
  { host: /^(?:gist\.)?github\.com$/, item: /^\/([^/?#]+)/ },
];

/**
 * The thing the memory is about: a site, or one item on a shared platform.
 * Null for addresses that are never remembered (local network, raw IPs).
 */
export function historyKey(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  const { registrableDomain, suffix, isIpLiteral } = parseHost(host);
  if (isIpLiteral || !registrableDomain.includes('.')) return null;

  for (const p of PER_ITEM) {
    if (!p.host.test(host)) continue;
    const m = p.item.exec(u.pathname + u.search);
    // The platform's own pages (the Docs home, Drive's file list) are one entry.
    return m ? `${host}#${m.slice(1).join('/')}` : host;
  }
  // Free hosts: every subdomain is a different owner.
  if (freeHostOf(host, suffix, registrableDomain)) return host;
  return registrableDomain;
}

/** Record a visit. Returns a new entry; the caller stores it. */
export function noteVisit(entry: HistoryEntry | undefined, now: number, warnedNow: boolean): HistoryEntry {
  const today = dayNumber(now);
  if (!entry) return { first: today, last: today, days: 1, warned: warnedNow };
  return {
    first: entry.first,
    last: today,
    days: entry.last === today ? entry.days : entry.days + 1,
    warned: entry.warned || warnedNow,
  };
}

export function familiarity(entry: HistoryEntry | undefined, now: number): Familiarity {
  if (!entry) return { firstVisit: true, trusted: false, warnedBefore: false };
  const today = dayNumber(now);
  const trusted = !entry.warned && entry.days >= TRUST_DAYS && today - entry.first >= TRUST_SPAN_DAYS;
  return { firstVisit: false, trusted, warnedBefore: entry.warned };
}

/** Drop what has not been seen for a long time, then the oldest, to stay under the limit. */
export function prune(history: Record<string, HistoryEntry>, now: number): Record<string, HistoryEntry> {
  const today = dayNumber(now);
  const kept = Object.entries(history).filter(([, e]) => today - e.last <= FORGET_AFTER_DAYS);
  kept.sort((a, b) => b[1].last - a[1].last);
  return Object.fromEntries(kept.slice(0, HISTORY_LIMIT));
}
