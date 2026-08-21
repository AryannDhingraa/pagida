/**
 * Settings and local state.
 *
 * Everything Pagida stores lives in `chrome.storage.local` on this machine.
 * Nothing uses `chrome.storage.sync`, deliberately: sync would push a user's
 * browsing-derived data through a Google account, which is exactly the kind of
 * quiet data movement a security tool should not do without being asked.
 */
import type { Sensitivity } from '../core/score.js';

export interface Settings {
  /** Master switch. */
  enabled: boolean;
  /** How aggressively heuristic weights are applied. */
  sensitivity: Sensitivity;
  /** Show the in-page warning bar on danger-band pages. */
  showBanner: boolean;
  /** Look up domain registration age via RDAP. Sends the domain, never the URL. */
  useRdap: boolean;
  /** Download the OpenPhish community feed daily and check against it locally. */
  useFeeds: boolean;
  /** Google Safe Browsing lookups. Off unless the user supplies their own key. */
  useSafeBrowsing: boolean;
  safeBrowsingKey: string;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  sensitivity: 'balanced',
  showBanner: true,
  useRdap: true,
  useFeeds: true,
  useSafeBrowsing: false,
  safeBrowsingKey: '',
};

/** A site the user has explicitly judged, one way or the other. */
export interface UserMark {
  hostname: string;
  verdict: 'phishing' | 'safe';
  /** The URL the user was on when they made the call. */
  url: string;
  at: number;
  note?: string;
}

export interface Stored {
  settings: Settings;
  /** hostname -> user's own verdict. */
  marks: Record<string, UserMark>;
  /** registrable domain -> { ageDays, fetchedAt } */
  rdapCache: Record<string, { ageDays: number | null; at: number }>;
  /** Hostnames from the phishing feed. */
  feedHosts: string[];
  /** Full URLs from the phishing feed, normalised. */
  feedUrls: string[];
  feedUpdatedAt: number;
  /** Lifetime counters, shown on the options page. */
  stats: { pagesScanned: number; warnings: number; reports: number };
}

export const STORAGE_DEFAULTS: Stored = {
  settings: DEFAULT_SETTINGS,
  marks: {},
  rdapCache: {},
  feedHosts: [],
  feedUrls: [],
  feedUpdatedAt: 0,
  stats: { pagesScanned: 0, warnings: 0, reports: 0 },
};

export async function getSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

export async function getMarks(): Promise<Record<string, UserMark>> {
  const { marks } = await chrome.storage.local.get('marks');
  return marks ?? {};
}

export async function setMark(mark: UserMark): Promise<void> {
  const marks = await getMarks();
  marks[mark.hostname] = mark;
  await chrome.storage.local.set({ marks });
}

export async function clearMark(hostname: string): Promise<void> {
  const marks = await getMarks();
  delete marks[hostname];
  await chrome.storage.local.set({ marks });
}

export async function bumpStat(key: keyof Stored['stats'], by = 1): Promise<void> {
  const { stats } = await chrome.storage.local.get('stats');
  const next = { ...STORAGE_DEFAULTS.stats, ...(stats ?? {}) };
  next[key] += by;
  await chrome.storage.local.set({ stats: next });
}

export async function getStats(): Promise<Stored['stats']> {
  const { stats } = await chrome.storage.local.get('stats');
  return { ...STORAGE_DEFAULTS.stats, ...(stats ?? {}) };
}
