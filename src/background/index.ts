/**
 * Service worker: the orchestrator.
 *
 * MV3 workers are killed aggressively, so nothing important lives in a module
 * variable. Verdicts are held in a small in-memory map purely as a cache; if
 * the worker dies the popup simply asks the tab to re-report.
 */
import type { ReaderState } from '../email/health.js';
import type { DomEvidence, PageEvidence, Verdict } from '../core/types.js';
import { evidenceFromUrl, isAnalysable } from '../core/evidence.js';
import { BAND_NAME, evaluate, summarise } from '../core/score.js';
import { parseHost } from '../core/util/domain.js';
import { isPrivateHost, isSharedHost } from '../core/util/network.js';
import { BRAND_DOMAINS, isWellKnown } from '../core/data/index.js';
import { domainAgeDays } from '../services/rdap.js';
import { fetchFeed, loadFeed, normaliseUrl, saveFeed } from '../services/feeds.js';
import { safeBrowsingLookup } from '../services/safebrowsing.js';
import { lookupReputation } from '../services/pagidaApi.js';
import { forget, rememberClean, rememberedClean, bumpLookupStat } from '../services/memory.js';
import { blocklistSize, getIndex, listed, refreshBlocklist } from '../services/blocklist.js';
import { faviconHash, logoBrands } from '../services/logo.js';
import { forgetSignIns, noteSignIn, siteThisCopies } from '../services/signins.js';
import { bundledDmarc, lookupDmarc } from '../services/dmarc.js';
import { familiarityOf, forgetHistory, rememberVisit } from '../services/history.js';
import { decodeQr } from '../services/qr.js';
import { checkLink, evaluateEmail, senderDomain } from '../email/evaluate.js';
import { FREE_MAIL } from '../email/patterns.js';
import type { EmailEvidence, LinkFinding } from '../email/types.js';
import { buildReport, type TechFacts } from '../services/report.js';
import { animateIcon, setIconBand } from './icon.js';
import {
  bumpStat, clearMark, getMarks, getPolicy, getSettings, setMark, STORAGE_DEFAULTS,
} from '../shared/settings.js';
import type { Message } from '../shared/messages.js';

const FEED_ALARM = 'pagida-feed-refresh';
const FEED_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const verdictCache = new Map<number, Verdict>();
/** What the content script noticed about how each tab's page is built. */
const techCache = new Map<number, TechFacts>();
/** The URL each tab is on, so the popup can ask us instead of needing its own
 *  host permission for every site the user visits. */
const urlCache = new Map<number, string>();
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
      // The big list refreshes itself at most once a day, in the background.
      void refreshBlocklist(force);

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

async function paintBadge(tabId: number, verdict: Verdict, animate = false): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOUR[verdict.band] });
  await chrome.action.setBadgeText({ tabId, text: BADGE_TEXT[verdict.band] });
  await chrome.action.setTitle({
    tabId,
    title: `Pagida: ${BAND_NAME[verdict.band]}, ${verdict.score}/100. ${summarise(verdict)}`,
  });

  // The icon is drawn rather than loaded, so it can react. A short bounce and
  // blink when a page finishes being scored; a pulse on top of that when the
  // news is bad. Never a permanent loop.
  if (animate) void animateIcon(tabId, verdict.band);
  else void setIconBand(tabId, verdict.band);
}

// ---------------------------------------------------------------- scoring

/**
 * Links clicked in an email Pagida checked, by destination hostname, for two
 * minutes: long enough for the page to load in a new tab, short enough that a
 * later, unrelated visit is not taken as coming from that email.
 */
const ARRIVAL_MS = 2 * 60 * 1000;
const arrivals = new Map<string, { at: number; band: Verdict['band']; warned: boolean }>();
function noteArrival(href: string, band: Verdict['band'], warned: boolean): void {
  try {
    const host = new URL(href).hostname.toLowerCase();
    if (arrivals.size > 50) arrivals.clear();
    arrivals.set(host, { at: Date.now(), band, warned });
  } catch { /* not a URL */ }
}
function takeArrival(hostname: string): { band: Verdict['band']; warned: boolean } | undefined {
  const a = arrivals.get(hostname.toLowerCase());
  if (!a) return undefined;
  if (Date.now() - a.at > ARRIVAL_MS) { arrivals.delete(hostname); return undefined; }
  return a;
}

/**
 * Score a URL, optionally with page evidence. Every enrichment step is
 * independently optional and independently allowed to fail.
 */
async function score(url: string, dom?: DomEvidence): Promise<Verdict | null> {
  const base = evidenceFromUrl(url);
  if (!base) return null;

  const settings = await getSettings();
  const evidence: PageEvidence = { ...base, dom: dom ? { ...dom } : undefined };

  // This person's own history with the site, and whether they just clicked
  // here from an email. Both stay on this computer.
  if (settings.rememberHistory) {
    const seen = await familiarityOf(url);
    if (seen) evidence.history = seen;
  }
  const click = takeArrival(base.hostname);
  if (click) evidence.arrival = { fromEmail: true, emailBand: click.band, emailWarned: click.warned };

  // User's own call on this host, if any.
  const marks = await getMarks();
  const mark = marks[base.hostname];
  if (mark?.verdict === 'safe') evidence.userTrusted = true;
  if (mark?.verdict === 'phishing') evidence.userReported = true;

  // Local addresses are never looked up anywhere: no RDAP, no Pagida service,
  // no Safe Browsing. An internal hostname is not ours to send.
  const local = isPrivateHost(base.hostname);
  const { sld, registrableDomain } = parseHost(base.hostname);
  const known = BRAND_DOMAINS.has(registrableDomain) || isWellKnown(registrableDomain);
  const opts = { sensitivity: settings.sensitivity };

  if (evidence.userTrusted || evidence.userReported || local) return evaluate(evidence, opts);

  // ---- 1. Local checks: free, offline, every visit, never remembered. ----
  if (settings.useFeeds) {
    const feed = await loadFeed();
    if (feed.urls.size > 0) {
      evidence.feedUrlHit = feed.urls.has(normaliseUrl(url));
      // A host-level match only means something on a host one party owns.
      // v3 matched s3.us-east-2.amazonaws.com and so flagged every S3 file
      // in that region as "confirmed phishing", with no way to silence it.
      evidence.feedHostHit = feed.hosts.has(base.hostname) && !isSharedHost(base.hostname, sld, known);
    }
    const index = await getIndex();
    if (index) evidence.blocklistHit = listed(index, base.hostname);
  }

  // The organisation's own sites: treated like a site the person marked safe,
  // after the local lists have had their say (a confirmed match still shows).
  const { orgDomains } = await getPolicy();
  if (orgDomains.some((d) => registrableDomain === d || base.hostname.endsWith(`.${d}`))) {
    evidence.userTrusted = true;
    return evaluate(evidence, opts);
  }

  // Domain age is the slowest local step (a registry lookup, cached for a
  // week). Start it now and let it run while the on-page checks happen.
  const agePromise = settings.useRdap && !known ? domainAgeDays(base.hostname).catch(() => undefined) : Promise.resolve(undefined);

  // Logo matching only where it can change the answer: an unknown site that
  // asks for a secret or behaves like a lure.
  if (evidence.dom && !known) {
    const d = evidence.dom;
    const worthIt = d.hasPasswordField || d.asksCard || d.asksOneTimeCode || d.asksSeedPhrase || d.documentLure || d.cryptoLure;
    const [brands, icon] = await Promise.all([
      worthIt ? logoBrands(d.faviconUrl) : Promise.resolve([]),
      d.hasPasswordField && settings.rememberSignIns && !isSharedHost(base.hostname, sld, known) ? faviconHash(d.faviconUrl) : Promise.resolve(null),
    ]);
    if (worthIt) d.logoBrands = brands;
    // Does it wear the icon of a site this person really signs in to?
    if (icon) {
      const copied = await siteThisCopies(registrableDomain, icon);
      if (copied) d.copiesSignInSite = copied;
    }
  }

  // A page the on-page checks already call an attack is answered now. Age can
  // only lower a guess, never a named reason, so waiting for it changes nothing.
  const early = evaluate(evidence, opts);
  if (early.conclusions.some((c) => c.floor === 'danger')) {
    await forget(base.hostname);
    return early;
  }

  const age = await agePromise;
  if (age !== undefined) evidence.domainAgeDays = age;

  const first = evaluate(evidence, opts);
  const namedReason = first.conclusions.some((c) => c.floor === 'danger');

  // ---- 2. Remote checks, only when they can still change the answer. ----
  // A page the local engine already calls an attack needs no second opinion.
  // Top sites and brand domains are covered by Chrome's own Safe Browsing.
  // Anything else is asked at most once a day per site (lookup memory).
  let asked = false;
  if (settings.usePagidaService && !namedReason && !known) {
    if (await rememberedClean(base.hostname)) {
      void bumpLookupStat('remembered');
    } else {
      const rep = await lookupReputation(base.hostname);
      asked = true;
      void bumpLookupStat('asked');
      if (rep) {
        evidence.webRiskHit = rep.listed;
        evidence.webRiskThreats = rep.threatTypes;
        if (!rep.listed) await rememberClean(base.hostname);
      }
    }
  } else if (settings.usePagidaService) {
    void bumpLookupStat('skipped');
  }
  // Safe Browsing sends the full URL, so it is opt-in with the user's key.
  if (settings.useSafeBrowsing && settings.safeBrowsingKey && !namedReason) {
    const hit = await safeBrowsingLookup(url, settings.safeBrowsingKey);
    if (hit !== undefined) evidence.safeBrowsingHit = hit;
    asked = true;
  }

  const verdict = asked ? evaluate(evidence, opts) : first;

  // The page looks wrong: whatever was remembered about this site is stale.
  if (verdict.band === 'suspicious' || verdict.band === 'danger' || verdict.conclusions.length > 0) {
    await forget(base.hostname);
  }
  return verdict;
}

// ---------------------------------------------------------------- email

/**
 * Check one open email: every link and QR code through the web engine and the
 * local blocklists, then the email rules, then (online, when it can still
 * matter) domain ages and Google's threat lists for the unknown domains.
 */
/** What the popup shows on a webmail tab: how many emails were checked there, and the last warning. */
interface MailStatus { checked: number; warned: number; reader?: ReaderState; last?: { band: string; title: string; from: string } }
const mailStatus = new Map<number, MailStatus>();

const hostOf = (href: string): string => { try { return new URL(href).hostname.toLowerCase(); } catch { return ''; } };

async function scoreEmail(email: EmailEvidence, imageUrls: string[]) {
  const settings = await getSettings();
  const decoded = await Promise.all(imageUrls.slice(0, 3).map((img) => decodeQr(img)));
  const qrUrls = decoded.filter((d): d is string => !!d && /^https?:\/\//i.test(d));
  const targets = [...new Set([...email.links.map((l) => l.href), ...qrUrls])].slice(0, 40);
  const feed = settings.useFeeds ? await loadFeed() : null;
  const index = settings.useFeeds ? await getIndex() : null;
  const findings: LinkFinding[] = targets.map((href) => {
    const f = checkLink(href);
    try {
      const host = new URL(href).hostname.toLowerCase();
      const { sld } = parseHost(host);
      const listedInFeed = !!feed && (feed.urls.has(normaliseUrl(href)) || (feed.hosts.has(host) && !isSharedHost(host, sld, false)));
      f.listed = listedInFeed || (!!index && listed(index, host));
    } catch { /* not a URL */ }
    return f;
  });
  const { orgDomains } = await getPolicy();
  // Can the sender's address be forged? Bundled for brands; for the reader's
  // own organisation, asked once a month (only that domain name is sent).
  const sender = senderDomain(email.fromAddress);
  const readerDomain = senderDomain(email.toAddress ?? '');
  const ownOrg = !!sender && !FREE_MAIL.has(sender) && (
    parseHost(sender).registrableDomain === parseHost(readerDomain).registrableDomain
    || orgDomains.some((o) => sender === o || sender.endsWith(`.${o}`)));
  const senderDmarc = bundledDmarc(sender) ?? (ownOrg && settings.useDmarc ? await lookupDmarc(sender) : undefined);
  let verdict = evaluateEmail({ ...email, qrUrls, orgDomains, senderDmarc }, findings);

  // ---- Online checks, only while they can still change the answer. ----
  // Only domain names leave the computer, never the email or a full link:
  // the registry is asked how old the sender's and links' domains are, and
  // the Pagida service whether a link's hostname is on Google's threat lists.
  // Known sites are never asked about, and an email already called an attack
  // needs no second opinion.
  if (verdict.band !== 'danger') {
    const unknownHosts = [...new Set(targets.map(hostOf).filter((h) => h && !isPrivateHost(h)))]
      .filter((h) => { const d = parseHost(h).registrableDomain; return !BRAND_DOMAINS.has(d) && !isWellKnown(d); })
      .slice(0, 3);
    let changed = false;
    const domainAges: Record<string, number | null> = {};
    // Both lookups run side by side, so an email waits for the slowest answer
    // (each times out after a few seconds), not for the sum of them all.
    const ages = async (): Promise<void> => {
      if (!settings.useRdap) return;
      const sender = senderDomain(email.fromAddress);
      const domains = [...new Set([sender, ...unknownHosts.map((h) => parseHost(h).registrableDomain)])]
        .filter((d) => d && !FREE_MAIL.has(d) && !BRAND_DOMAINS.has(d) && !isWellKnown(d)).slice(0, 4);
      await Promise.all(domains.map(async (d) => {
        const age = await domainAgeDays(d);
        if (age !== undefined) { domainAges[d] = age; changed = true; }
      }));
    };
    const lists = async (): Promise<void> => {
      if (!settings.usePagidaService) return;
      await Promise.all(unknownHosts.map(async (host) => {
        if (await rememberedClean(host)) { void bumpLookupStat('remembered'); return; }
        const rep = await lookupReputation(host);
        void bumpLookupStat('asked');
        if (!rep) return;
        if (!rep.listed) { await rememberClean(host); return; }
        for (const f of findings) if (hostOf(f.href) === host) f.listed = true;
        changed = true;
      }));
    };
    await Promise.all([ages(), lists()]);
    if (changed) verdict = evaluateEmail({ ...email, qrUrls, domainAges, orgDomains, senderDmarc }, findings);
  }

  await bumpStat('emailsChecked');
  if (verdict.conclusions.length > 0) await bumpStat('warnings');
  return { verdict, findings };
}

// ---------------------------------------------------------------- messages

const MAIL_HOSTS = new Set(['mail.google.com', 'outlook.live.com', 'outlook.office.com', 'outlook.office365.com']);

/**
 * A content script may only speak for the page it runs in. Pagida's own pages
 * (popup, options, report) may ask about any address. This costs nothing in
 * normal use and means a page that somehow got hold of a content script's
 * voice still could not mark another site as safe, or pose as a mailbox.
 */
function speaksForItself(msg: Message, sender: chrome.runtime.MessageSender): boolean {
  if (!sender.tab) return true;
  const from = sender.url ?? sender.tab.url ?? '';
  if (from.startsWith(chrome.runtime.getURL(''))) return true;
  let host: string;
  try { host = new URL(from).hostname; } catch { return false; }
  if (msg.type === 'EMAIL_SIGNALS' || msg.type === 'MAIL_HEALTH' || msg.type === 'EMAIL_LINK_OPENED') return MAIL_HOSTS.has(host);
  const claimed = (msg as { url?: unknown }).url;
  if (typeof claimed !== 'string') return true;
  try { return new URL(claimed).hostname === host; } catch { return false; }
}

chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
  void (async () => {
    try {
      if (!speaksForItself(msg, sender)) return sendResponse({ ok: false, error: 'wrong-sender' });
      switch (msg.type) {
        case 'PAGE_SIGNALS': {
          const settings = await getSettings();
          const tabId = sender.tab?.id;
          if (!settings.enabled || tabId === undefined) return sendResponse({ ok: true });

          // Cheap no-op once the feed is present and fresh.
          void ensureFeed();

          const verdict = await score(msg.url, msg.dom);
          if (!verdict) return sendResponse({ ok: true });

          if (msg.tech) techCache.set(tabId, msg.tech);
          urlCache.set(tabId, msg.url);

          // Count each page once, not once per re-scan. The content script
          // re-reports when a login form appears late; that is the same page.
          const previous = verdictCache.get(tabId);
          const isNewPage = previous?.url !== verdict.url;

          verdictCache.set(tabId, verdict);
          await paintBadge(tabId, verdict, isNewPage);
          if (isNewPage && settings.rememberHistory) void rememberVisit(msg.url, verdict.conclusions.length > 0 || verdict.band === 'danger');
          if (isNewPage) await bumpStat('pagesScanned');

          // Iris steps onto the page from "suspicious" upward, not only at the
          // top band, the old build stayed silent through the whole middle of
          // the range, which is where most real judgement calls live.
          // Iris only steps onto the page when the engine can say WHY in one
          // sentence: a conclusion or a confirmed match. Heuristics alone
          // colour the badge and wait in the popup. Interrupting someone on
          // cosmetic evidence is how v3 taught people to ignore her.
          const speaks = verdict.band === 'danger'
            || (verdict.band === 'suspicious' && verdict.conclusions.length > 0);
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

        case 'SIGNED_IN': {
          const settings = await getSettings();
          const tabId = sender.tab?.id;
          if (!settings.enabled || !settings.rememberSignIns || tabId === undefined) return sendResponse({ ok: true });
          // Learn only from pages already judged fine, so a phishing page can
          // never teach Pagida that it is one of your sites.
          const verdict = verdictCache.get(tabId);
          if (!verdict || verdict.conclusions.length > 0 || (verdict.band !== 'clean' && verdict.band !== 'caution')) return sendResponse({ ok: true });
          const { hostname } = new URL(msg.url);
          const { sld, registrableDomain } = parseHost(hostname);
          const known = BRAND_DOMAINS.has(registrableDomain) || isWellKnown(registrableDomain);
          if (isPrivateHost(hostname) || isSharedHost(hostname, sld, known)) return sendResponse({ ok: true });
          const icon = await faviconHash(msg.faviconUrl);
          if (icon) await noteSignIn(registrableDomain, icon);
          return sendResponse({ ok: true });
        }

        case 'EMAIL_LINK_OPENED': {
          noteArrival(msg.href, msg.band, msg.warned);
          return sendResponse({ ok: true });
        }

        case 'FORGET_HISTORY': {
          if (!(sender.url ?? '').startsWith(chrome.runtime.getURL(''))) return sendResponse({ ok: false, error: 'wrong-sender' });
          await forgetHistory();
          return sendResponse({ ok: true });
        }

        case 'FORGET_SIGN_INS': {
          // Only Pagida's own Options page may wipe it, never a web page's script.
          if (!(sender.url ?? '').startsWith(chrome.runtime.getURL(''))) return sendResponse({ ok: false, error: 'wrong-sender' });
          await forgetSignIns();
          return sendResponse({ ok: true });
        }

        case 'UNMARK_SITE': {
          await clearMark(msg.hostname);
          return sendResponse({ ok: true });
        }

        case 'REFRESH_FEED': {
          const [snapshot] = await Promise.all([fetchFeed(), refreshBlocklist(true)]);
          if (!snapshot) return sendResponse({ ok: false, error: 'feed-unavailable' });
          await saveFeed(snapshot);
          return sendResponse({ ok: true, feedCount: snapshot.urls.length + blocklistSize(), updatedAt: snapshot.updatedAt });
        }

        case 'BUILD_REPORT': {
          // Reuse the verdict the popup is already showing for this exact URL.
          // Scoring again here would drop the page-tier signals, because those
          // come from the content script and cannot be recovered from the
          // address alone, and the report would then contradict the popup.
          let tech: TechFacts | undefined;
          let verdict: Verdict | null = null;
          for (const [id, url] of urlCache) {
            if (url !== msg.url) continue;
            tech = techCache.get(id);
            verdict = verdictCache.get(id) ?? null;
            break;
          }
          // No open tab for this address: a right-click link check, or a report
          // opened after the tab closed. Address tier is all there is.
          if (!verdict) verdict = await score(msg.url);
          const report = await buildReport(msg.url, verdict ?? undefined, tech);
          if (!report) return sendResponse({ ok: false, error: 'not-analysable' });
          return sendResponse({ ok: true, report });
        }

        case 'GET_TAB_URL': {
          const known = urlCache.get(msg.tabId);
          if (known) return sendResponse({ ok: true, url: known });
          // Fall back to asking Chrome. With activeTab this succeeds while the
          // popup is open; without it, it will not, and that is not an error.
          try {
            const tab = await chrome.tabs.get(msg.tabId);
            if (tab.url) {
              urlCache.set(msg.tabId, tab.url);
              return sendResponse({ ok: true, url: tab.url });
            }
          } catch { /* no permission for this tab */ }
          return sendResponse({ ok: false, error: 'unknown-url' });
        }

        case 'OPEN_REPORT': {
          await chrome.tabs.create({
            url: chrome.runtime.getURL(`report.html?u=${encodeURIComponent(msg.url)}`),
          });
          return sendResponse({ ok: true });
        }

        case 'EMAIL_SIGNALS': {
          const settings = await getSettings();
          if (!settings.enabled || !settings.checkEmail) return sendResponse({ ok: false, error: 'off' });
          const { verdict, findings } = await scoreEmail(msg.email, msg.imageUrls);
          const tabId = sender.tab?.id;
          if (tabId !== undefined) {
            const st = mailStatus.get(tabId) ?? { checked: 0, warned: 0 };
            st.checked++;
            if (verdict.conclusions[0]) {
              st.warned++;
              st.last = { band: verdict.band, title: verdict.conclusions[0].title, from: msg.email.fromAddress };
            }
            mailStatus.set(tabId, st);
          }
          return sendResponse({ ok: true, verdict, findings });
        }

        case 'MAIL_HEALTH': {
          const tabId = sender.tab?.id;
          if (tabId !== undefined) {
            const st = mailStatus.get(tabId) ?? { checked: 0, warned: 0 };
            st.reader = msg.state;
            mailStatus.set(tabId, st);
          }
          return sendResponse({ ok: true });
        }

        case 'GET_MAIL_STATUS': {
          const settings = await getSettings();
          return sendResponse({ ok: true, mail: { on: settings.enabled && settings.checkEmail, ...(mailStatus.get(msg.tabId) ?? { checked: 0, warned: 0 }) } });
        }

        case 'RESCAN':
          // Not for the worker. The popup sends this straight to the tab.
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

    void injectIntoOpenTabs();
    if (details.reason === 'install') {
      void chrome.tabs.create({ url: chrome.runtime.getURL('options.html?welcome=1') });
    }
    // People upgrading from before 6.0 get one line in the popup about email checking.
    const before = Number((details.previousVersion ?? '').split('.')[0]);
    if (details.reason === 'update' && before > 0 && before < 6) await chrome.storage.local.set({ whatsNew: '6.0' });
  })();
});

/**
 * Chrome only runs content scripts on pages loaded after the extension was
 * installed or updated. Without this, a Gmail tab that was already open stays
 * unchecked until it is reloaded, which looks exactly like email checking not
 * working at all.
 */
async function injectIntoOpenTabs(): Promise<void> {
  const WEBMAIL = /^https:\/\/(?:mail\.google\.com|outlook\.(?:live|office|office365)\.com)\//;
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }).catch(() => []);
  for (const tab of tabs) {
    if (tab.id === undefined || !tab.url || tab.discarded) continue;
    const files = WEBMAIL.test(tab.url) ? ['content.js', 'mail.js'] : ['content.js'];
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files }).catch(() => undefined);
  }
}

chrome.runtime.onStartup.addListener(() => {
  installMenus();
  chrome.alarms.create(FEED_ALARM, { periodInMinutes: 60 * 12, delayInMinutes: 60 * 12 });
  void ensureFeed();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === FEED_ALARM) void ensureFeed(true);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  verdictCache.delete(tabId);
  mailStatus.delete(tabId);
  techCache.delete(tabId);
  urlCache.delete(tabId);
});
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') {
    verdictCache.delete(tabId);
    techCache.delete(tabId);
    void chrome.action.setBadgeText({ tabId, text: '' });
    void setIconBand(tabId, 'clean');
  }
  if (info.url) urlCache.set(tabId, info.url);
});
