/**
 * The OpenPhish community feed.
 *
 * We fetch their public feed directly at runtime rather than bundling a copy in
 * the repo. Two reasons: a bundled snapshot is stale the day it ships, and
 * redistributing someone else's threat data inside an extension package raises
 * licensing questions we don't need to have.
 *
 * The lookup itself is entirely local — the feed is downloaded once a day and
 * matched in memory, so no URL you visit is ever sent anywhere.
 */
const FEED_URL = 'https://raw.githubusercontent.com/openphish/public_feed/main/feed.txt';
const MAX_ENTRIES = 20_000;

export interface FeedSnapshot {
  hosts: string[];
  urls: string[];
  updatedAt: number;
}

/** Strip the scheme, trailing slash and fragment so two spellings compare equal. */
export function normaliseUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/+$/, '');
    return `${u.hostname.toLowerCase()}${path}${u.search}`;
  } catch {
    return raw.trim().toLowerCase();
  }
}

export async function fetchFeed(): Promise<FeedSnapshot | null> {
  try {
    const res = await fetch(FEED_URL, { cache: 'no-cache' });
    if (!res.ok) return null;
    const text = await res.text();

    const hosts = new Set<string>();
    const urls = new Set<string>();
    for (const line of text.split('\n')) {
      const entry = line.trim();
      if (!entry || entry.startsWith('#')) continue;
      if (urls.size >= MAX_ENTRIES) break;
      urls.add(normaliseUrl(entry));
      try { hosts.add(new URL(entry).hostname.toLowerCase()); } catch { /* skip */ }
    }
    if (urls.size === 0) return null;
    return { hosts: [...hosts], urls: [...urls], updatedAt: Date.now() };
  } catch {
    return null;
  }
}

export async function saveFeed(snapshot: FeedSnapshot): Promise<void> {
  await chrome.storage.local.set({
    feedHosts: snapshot.hosts,
    feedUrls: snapshot.urls,
    feedUpdatedAt: snapshot.updatedAt,
  });
}

export async function loadFeed(): Promise<{ hosts: Set<string>; urls: Set<string>; updatedAt: number }> {
  const { feedHosts, feedUrls, feedUpdatedAt } = await chrome.storage.local.get([
    'feedHosts', 'feedUrls', 'feedUpdatedAt',
  ]);
  return {
    hosts: new Set<string>(feedHosts ?? []),
    urls: new Set<string>(feedUrls ?? []),
    updatedAt: feedUpdatedAt ?? 0,
  };
}
