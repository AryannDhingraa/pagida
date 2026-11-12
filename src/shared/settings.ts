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
  /** Let Iris appear on the page itself when something is wrong. */
  showBanner: boolean;
  /** Gather the full site report. Extra lookups, so it is opt-out. */
  siteReport: boolean;
  /** Look up domain registration age via RDAP. Sends the domain, never the URL. */
  useRdap: boolean;
  /** Download the OpenPhish community feed daily and check against it locally. */
  useFeeds: boolean;
  /**
   * Ask the Pagida service whether a domain is on Google's threat lists.
   *
   * Sends a bare domain name, never the address of the page. On by default,
   * because the people this protects are the ones who will never find a
   * settings screen; one switch here turns it off for good.
   */
  usePagidaService: boolean;
  /** Google Safe Browsing lookups. Off unless the user supplies their own key. */
  useSafeBrowsing: boolean;
  safeBrowsingKey: string;
  /** Check emails opened in Gmail and Outlook on the web. All on this computer. */
  checkEmail: boolean;
  /** Remember, on this computer, which sites the person signs in to, to spot copies of them. */
  rememberSignIns: boolean;
  /** Look up whether your organisation's email address can be forged (DMARC). Sends that domain name only. */
  useDmarc: boolean;
  /** Keep a scrambled, on-device memory of the sites you use and how you reached them. */
  rememberHistory: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  sensitivity: 'balanced',
  showBanner: true,
  siteReport: true,
  useRdap: true,
  useFeeds: true,
  usePagidaService: true,
  useSafeBrowsing: false,
  safeBrowsingKey: '',
  checkEmail: true,
  rememberSignIns: true,
  useDmarc: true,
  rememberHistory: true,
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
  stats: { pagesScanned: number; warnings: number; reports: number; emailsChecked: number };
}

export const STORAGE_DEFAULTS: Stored = {
  settings: DEFAULT_SETTINGS,
  marks: {},
  rdapCache: {},
  feedHosts: [],
  feedUrls: [],
  feedUpdatedAt: 0,
  stats: { pagesScanned: 0, warnings: 0, reports: 0, emailsChecked: 0 },
};

/**
 * What an organisation has set through Chrome policy (managed storage).
 * Empty on a personal install. A key present here wins over the person's own
 * choice and is shown as locked in Options.
 */
export interface Policy { settings: Partial<Settings>; orgDomains: string[] }

const POLICY_KEYS = new Set<keyof Settings>(['enabled', 'sensitivity', 'showBanner', 'siteReport', 'useRdap', 'useFeeds', 'usePagidaService', 'checkEmail', 'rememberSignIns', 'useDmarc', 'rememberHistory']);

export async function getPolicy(): Promise<Policy> {
  try {
    const raw = await chrome.storage.managed.get(['settings', 'orgDomains']) as { settings?: Record<string, unknown>; orgDomains?: unknown };
    const settings: Partial<Settings> = {};
    for (const [k, v] of Object.entries(raw.settings ?? {})) {
      if (POLICY_KEYS.has(k as keyof Settings) && typeof v === typeof DEFAULT_SETTINGS[k as keyof Settings]) {
        (settings as Record<string, unknown>)[k] = v;
      }
    }
    const orgDomains = Array.isArray(raw.orgDomains)
      ? raw.orgDomains.filter((d): d is string => typeof d === 'string').map((d) => d.trim().toLowerCase().replace(/^\*?\./, '')).filter(Boolean)
      : [];
    return { settings, orgDomains };
  } catch {
    // No policy support here (or none set): a personal install.
    return { settings: {}, orgDomains: [] };
  }
}

export async function getSettings(): Promise<Settings> {
  const [{ settings }, policy] = await Promise.all([chrome.storage.local.get('settings'), getPolicy()]);
  return { ...DEFAULT_SETTINGS, ...(settings ?? {}), ...policy.settings };
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
