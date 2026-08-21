/**
 * Options page.
 *
 * Also doubles as the first-run screen. The privacy copy here is not marketing —
 * it is the actual list of network calls the extension can make, and it is kept
 * in step with the code by being the only place either is described.
 */
import type { Sensitivity } from '../core/score.js';
import type { UserMark } from '../shared/settings.js';
import { clearMark, getMarks, getSettings, getStats, setSettings } from '../shared/settings.js';
import type { Message } from '../shared/messages.js';

declare const __PAGIDA_VERSION__: string;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const controls = {
  enabled: $<HTMLInputElement>('enabled'),
  sensitivity: $<HTMLSelectElement>('sensitivity'),
  showBanner: $<HTMLInputElement>('showBanner'),
  useRdap: $<HTMLInputElement>('useRdap'),
  useFeeds: $<HTMLInputElement>('useFeeds'),
  useSafeBrowsing: $<HTMLInputElement>('useSafeBrowsing'),
  safeBrowsingKey: $<HTMLInputElement>('safeBrowsingKey'),
};

function relativeTime(ts: number): string {
  if (!ts) return 'never';
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

async function loadSettings(): Promise<void> {
  const s = await getSettings();
  controls.enabled.checked = s.enabled;
  controls.sensitivity.value = s.sensitivity;
  controls.showBanner.checked = s.showBanner;
  controls.useRdap.checked = s.useRdap;
  controls.useFeeds.checked = s.useFeeds;
  controls.useSafeBrowsing.checked = s.useSafeBrowsing;
  controls.safeBrowsingKey.value = s.safeBrowsingKey;
}

function wireSettings(): void {
  controls.enabled.addEventListener('change', () => void setSettings({ enabled: controls.enabled.checked }));
  controls.showBanner.addEventListener('change', () => void setSettings({ showBanner: controls.showBanner.checked }));
  controls.useRdap.addEventListener('change', () => void setSettings({ useRdap: controls.useRdap.checked }));
  controls.useFeeds.addEventListener('change', () => void setSettings({ useFeeds: controls.useFeeds.checked }));
  controls.useSafeBrowsing.addEventListener('change', () =>
    void setSettings({ useSafeBrowsing: controls.useSafeBrowsing.checked }));
  controls.sensitivity.addEventListener('change', () =>
    void setSettings({ sensitivity: controls.sensitivity.value as Sensitivity }));
  controls.safeBrowsingKey.addEventListener('change', () =>
    void setSettings({ safeBrowsingKey: controls.safeBrowsingKey.value.trim() }));
}

async function renderFeedStatus(): Promise<void> {
  const { feedUrls, feedUpdatedAt } = await chrome.storage.local.get(['feedUrls', 'feedUpdatedAt']);
  const count = (feedUrls ?? []).length;
  $('feed-status').textContent = count
    ? `${count.toLocaleString()} known phishing URLs · updated ${relativeTime(feedUpdatedAt ?? 0)}`
    : 'not loaded yet — press refresh';
}

async function renderMarks(): Promise<void> {
  const marks = await getMarks();
  const list = $<HTMLUListElement>('marks');
  const entries = Object.values(marks).sort((a, b) => b.at - a.at);
  list.replaceChildren();
  $('marks-empty').hidden = entries.length > 0;

  for (const mark of entries) {
    list.appendChild(markRow(mark));
  }
}

function markRow(mark: UserMark): HTMLLIElement {
  const li = document.createElement('li');

  const tag = document.createElement('span');
  tag.className = `tag ${mark.verdict}`;
  tag.textContent = mark.verdict === 'phishing' ? 'PHISHING' : 'SAFE';

  const host = document.createElement('span');
  host.className = 'h';
  host.textContent = mark.hostname;

  const when = document.createElement('span');
  when.className = 'when';
  when.textContent = relativeTime(mark.at);

  const remove = document.createElement('button');
  remove.textContent = 'remove';
  remove.addEventListener('click', () => void (async () => {
    await clearMark(mark.hostname);
    await renderMarks();
  })());

  li.append(tag, host, when, remove);
  return li;
}

async function renderStats(): Promise<void> {
  const stats = await getStats();
  $('stat-scanned').textContent = stats.pagesScanned.toLocaleString();
  $('stat-warnings').textContent = stats.warnings.toLocaleString();
  $('stat-reports').textContent = stats.reports.toLocaleString();
}

$('refresh-feed').addEventListener('click', () => void (async () => {
  const btn = $<HTMLButtonElement>('refresh-feed');
  btn.disabled = true;
  btn.textContent = 'refreshing…';
  const res = await chrome.runtime.sendMessage({ type: 'REFRESH_FEED' } satisfies Message)
    .catch(() => null);
  btn.disabled = false;
  btn.textContent = 'refresh now';
  if (!res?.ok) $('feed-status').textContent = 'could not reach the blocklist — try again later';
  else await renderFeedStatus();
})());

$('export-marks').addEventListener('click', () => void (async () => {
  const marks = await getMarks();
  const blob = new Blob([JSON.stringify(Object.values(marks), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pagida-marks-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
})());

$('clear-marks').addEventListener('click', () => void (async () => {
  if (!confirm('Remove every site you have marked? Pagida will go back to scoring them normally.')) return;
  await chrome.storage.local.set({ marks: {} });
  await renderMarks();
})());

async function init(): Promise<void> {
  $('version').textContent = `v${__PAGIDA_VERSION__}`;
  if (new URLSearchParams(location.search).get('welcome')) $('welcome').hidden = false;
  await loadSettings();
  wireSettings();
  await Promise.all([renderFeedStatus(), renderMarks(), renderStats()]);
}

void init();
