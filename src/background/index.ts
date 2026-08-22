/**
 * Service worker — the orchestrator.
 *
 * MV3 workers are killed aggressively, so nothing important lives in a module
 * variable. Verdicts are held in a small in-memory map purely as a cache; if
 * the worker dies the popup simply asks the tab to re-report.
 */
import type { DomEvidence, Verdict } from '../core/types.js';
import { evidenceFromUrl, isAnalysable } from '../core/evidence.js';
import { evaluate, summarise } from '../core/score.js';
import { parseHost } from '../core/util/domain.js';
import { domainAgeDays } from '../services/rdap.js';
import { fetchFeed, loadFeed, normaliseUrl, saveFeed } from '../services/feeds.js';
import { safeBrowsingLookup } from '../services/safebrowsing.js';
import { buildReport } from '../services/report.js';
import {
  bumpStat, clearMark, getMarks, getSettings, setMark, STORAGE_DEFAULTS,
} from '../shared/settings.js';
import type { Message } from '../shared/messages.js';

const FEED_ALARM = 'pagida-feed-refresh';
const FEED_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const verdictCache = new Map<number, Verdict>();
/** Guards against several tabs all kicking off a feed download at once. */
let feedRefreshInFlight: Promise<void> | null = null;

/**
 * Download the blocklist if we have never had it, or if it is more than a day
 * old.
 *
 * This used to rely purely on `chrome.alarms`, which was a mistake: alarms are
 * clamped to a minimum delay, are not guaranteed to fire promptly after an
 * install, and are dropped entirely if the browser is closed before they come
 * due. The result was a fresh install sitting with an empty blocklist and no
 * indication of why. The alarm is still there for the long-run refresh; this
 * function is what makes the feature work on day one.
 */
async function ensureFeed(force = false): Promise<void> {
  if (feedRefreshInFlight) return feedRefreshInFlight;

  feedRefreshInFlight = (async () => {
    try {
      const settings = await getSettings();
      if (!settings.useFeeds) return;

      const current = await loadFeed();
      const stale = Date.now() - current.updatedAt > FEED_MAX_AGE_MS;
      if (!force && current.urls.size > 0 && !stale) return;

      const snapshot = await fetchFeed();
      if (snapshot) await saveFeed(snapshot);
    } catch {
      // Offline, rate-limited, or GitHub is having a day. Try again later.
    } finally {
      feedRefreshInFlight = null;
    }
  })();

  return feedRefreshInFlight;
}

// ---------------------------------------------------------------- badge

const BADGE_COLOUR: Record<Verdict['band'], string> = {
  clean: '#2B6D55',
  caution: '#1F6C8C',
  suspicious: '#8A6100',
  danger: '#A32B24',
};

const BADGE_TEXT: Record<Verdict['band'], string> = {
  clean: '', caution: '!', suspicious: '!!', danger: '!!!',
};

async function paintBadge(tabId: number, verdict: Verdict): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOUR[verdict.band] });
  await chrome.action.setBadgeText({ tabId, text: BADGE_TEXT[verdict.band] });
  await chrome.action.setTitle({
    tabId,
    title: `Pagida — ${verdict.score}/100. ${summarise(verdict)}`,
  });
}

// ---------------------------------------------------------------- scoring

/**
 * Score a URL, optionally with page evidence. Every enrichment step is
 * independently optional and independently allowed to fail.
 */
async function score(url: string, dom?: DomEvidence): Promise<Verdict | null> {
  const base = evidenceFromUrl(url);
  if (!base) return null;

  const settings = await getSettings();
  const evidence = { ...base, dom };

  // User's own call on this host, if any.
  const marks = await getMarks();
  const mark = marks[base.hostname];
  if (mark?.verdict === 'safe') evidence.userTrusted = true;
  if (mark?.verdict === 'phishing') evidence.userReported = true;

  if (!evidence.userTrusted && !evidence.userReported) {
    // Feeds — local set membership, no network at lookup time.
    if (settings.useFeeds) {
      const feed = await loadFeed();
      if (feed.urls.size > 0) {
        evidence.feedUrlHit = feed.urls.has(normaliseUrl(url));
        evidence.feedHostHit = feed.hosts.has(base.hostname);
      }
    }
    // RDAP — sends the registrable domain only.
    if (settings.useRdap) {
      const age = await domainAgeDays(base.hostname);
      if (age !== undefined) evidence.domainAgeDays = age;
    }
    // Safe Browsing — sends the full URL, so it is opt-in with the user's key.
    if (settings.useSafeBrowsing && settings.safeBrowsingKey) {
      const hit = await safeBrowsingLookup(url, settings.safeBrowsingKey);
      if (hit !== undefined) evidence.safeBrowsingHit = hit;
    }
  }

  return evaluate(evidence, { sensitivity: settings.sensitivity });
}

// ---------------------------------------------------------------- messages

chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
  void (async () => {
    try {
      switch (msg.type) {
        case 'PAGE_SIGNALS': {
          const settings = await getSettings();
          const tabId = sender.tab?.id;
          if (!settings.enabled || tabId === undefined) return sendResponse({ ok: true });

          // Cheap no-op once the feed is present and fresh.
          void ensureFeed();

          const verdict = await score(msg.url, msg.dom);
          if (!verdict) return sendResponse({ ok: true });

          // Count each page once, not once per re-scan. The content script
          // re-reports when a login form appears late; that is the same page.
          const previous = verdictCache.get(tabId);
          const isNewPage = previous?.url !== verdict.url;

          verdictCache.set(tabId, verdict);
          await paintBadge(tabId, verdict);
          if (isNewPage) await bumpStat('pagesScanned');

          // Iris steps onto the page from "suspicious" upward, not only at the
          // top band — the old build stayed silent through the whole middle of
          // the range, which is where most real judgement calls live.
          const speaks = verdict.band === 'suspicious' || verdict.band === 'danger';
          if (speaks) {
            if (isNewPage || previous?.band !== verdict.band) await bumpStat('warnings');
            if (settings.showBanner && verdict.override !== 'trusted') {
              chrome.tabs.sendMessage(tabId, { type: 'SHOW_COMPANION', verdict } satisfies Message)
                .catch(() => { /* tab closed or navigated away */ });
            }
          }
          return sendResponse({ ok: true, verdict });
        }

        case 'GET_VERDICT': {
          const tabId = msg.tabId ?? sender.tab?.id;
          if (tabId !== undefined && verdictCache.has(tabId)) {
            return sendResponse({ ok: true, verdict: verdictCache.get(tabId) });
          }
          return sendResponse({ ok: false, error: 'no-verdict' });
        }

        case 'CHECK_URL': {
          const verdict = await score(msg.url);
          if (!verdict) return sendResponse({ ok: false, error: 'not-analysable' });
          return sendResponse({ ok: true, verdict });
        }

        case 'MARK_SITE': {
          const { hostname } = new URL(msg.url);
          await setMark({
            hostname: hostname.toLowerCase(),
            verdict: msg.verdict,
            url: msg.url,
            at: Date.now(),
          });
          if (msg.verdict === 'phishing') await bumpStat('reports');

          const tabId = sender.tab?.id;
          const verdict = await score(msg.url);
          if (tabId !== undefined && verdict) {
            verdictCache.set(tabId, verdict);
            await paintBadge(tabId, verdict);
            if (msg.verdict === 'safe') {
              chrome.tabs.sendMessage(tabId, { type: 'HIDE_COMPANION' } satisfies Message).catch(() => {});
            }
          }
          return sendResponse({ ok: true, verdict });
        }

        case 'UNMARK_SITE': {
          await clearMark(msg.hostname);
          return sendResponse({ ok: true });
        }

        case 'REFRESH_FEED': {
          const snapshot = await fetchFeed();
          if (!snapshot) return sendResponse({ ok: false, error: 'feed-unavailable' });
          await saveFeed(snapshot);
          return sendResponse({ ok: true, feedCount: snapshot.urls.length, updatedAt: snapshot.updatedAt });
        }

        case 'BUILD_REPORT': {
          // The verdict comes first so the report can lead with it, and so a
          // slow lookup never delays the part the user actually asked about.
          const verdict = await score(msg.url);
          const report = await buildReport(msg.url, verdict ?? undefined);
          if (!report) return sendResponse({ ok: false, error: 'not-analysable' });
          return sendResponse({ ok: true, report });
        }

        case 'OPEN_REPORT': {
          await chrome.tabs.create({
            url: chrome.runtime.getURL(`report.html?u=${encodeURIComponent(msg.url)}`),
          });
          return sendResponse({ ok: true });
        }

        case 'RESCAN':
          // Not for the worker — the popup sends this straight to the tab.
          return sendResponse({ ok: false, error: 'wrong-recipient' });

        default:
          return sendResponse({ ok: false, error: 'unknown-message' });
      }
    } catch (err) {
      return sendResponse({ ok: false, error: err instanceof Error ? err.message : 'unknown' });
    }
  })();
  return true; // keep the channel open for the async reply
});

// ---------------------------------------------------------------- context menu

const MENU_CHECK = 'pagida-check-link';
const MENU_REPORT = 'pagida-report-link';

function installMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_CHECK,
      title: 'Ask Iris about this link',
      contexts: ['link'],
    });
    chrome.contextMenus.create({
      id: MENU_REPORT,
      title: 'Report this link as a scam',
      contexts: ['link'],
    });
  });
}

chrome.contextMenus.onClicked.addListener((info) => {
  const url = info.linkUrl;
  if (!url || !isAnalysable(url)) return;

  if (info.menuItemId === MENU_CHECK) {
    void chrome.tabs.create({
      url: chrome.runtime.getURL(`report.html?u=${encodeURIComponent(url)}`),
    });
  } else if (info.menuItemId === MENU_REPORT) {
    void (async () => {
      await setMark({
        hostname: parseHost(new URL(url).hostname).hostname,
        verdict: 'phishing',
        url,
        at: Date.now(),
      });
      await bumpStat('reports');
      await chrome.tabs.create({
        url: chrome.runtime.getURL(`report.html?u=${encodeURIComponent(url)}`),
      });
    })();
  }
});

// ---------------------------------------------------------------- lifecycle

chrome.runtime.onInstalled.addListener((details) => {
  void (async () => {
    const existing = await chrome.storage.local.get(null);
    const seed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(STORAGE_DEFAULTS)) {
      if (existing[k] === undefined) seed[k] = v;
    }
    if (Object.keys(seed).length > 0) await chrome.storage.local.set(seed);

    installMenus();
    // `delayInMinutes` rather than a five-second `when`: Chrome clamps short
    // alarm delays, so the old version's "refresh almost immediately" never
    // actually happened.
    chrome.alarms.create(FEED_ALARM, { periodInMinutes: 60 * 12, delayInMinutes: 60 * 12 });
    void ensureFeed(true);

    if (details.reason === 'install') {
      void chrome.tabs.create({ url: chrome.runtime.getURL('options.html?welcome=1') });
    }
  })();
});

chrome.runtime.onStartup.addListener(() => {
  installMenus();
  chrome.alarms.create(FEED_ALARM, { periodInMinutes: 60 * 12, delayInMinutes: 60 * 12 });
  void ensureFeed();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === FEED_ALARM) void ensureFeed(true);
});

chrome.tabs.onRemoved.addListener((tabId) => verdictCache.delete(tabId));
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') {
    verdictCache.delete(tabId);
    void chrome.action.setBadgeText({ tabId, text: '' });
  }
});
