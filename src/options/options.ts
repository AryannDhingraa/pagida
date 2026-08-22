/**
 * Settings, and the first-run welcome.
 *
 * Everything here is written as Iris talking, because the alternative — a page
 * of technical toggles — is exactly what made the previous build unreadable to
 * anyone who was not already a security person.
 *
 * The privacy copy is not marketing. It is the actual list of network calls the
 * extension can make, kept truthful by being the only place either the calls or
 * the description of them is written down.
 */
import type { Sensitivity } from '../core/score.js';
import type { UserMark } from '../shared/settings.js';
import { clearMark, getMarks, getSettings, getStats, setSettings } from '../shared/settings.js';
import { Iris, injectIrisCss } from '../ui/iris.js';
import { Stepper, STEPPER_CSS, type Step } from '../ui/stepper.js';
import type { Message } from '../shared/messages.js';

declare const __PAGIDA_VERSION__: string;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

injectIrisCss(document);
const stepperStyle = document.createElement('style');
stepperStyle.textContent = STEPPER_CSS;
document.head.appendChild(stepperStyle);

const controls = {
  enabled: $<HTMLInputElement>('enabled'),
  sensitivity: $<HTMLSelectElement>('sensitivity'),
  showBanner: $<HTMLInputElement>('showBanner'),
  siteReport: $<HTMLInputElement>('siteReport'),
  useRdap: $<HTMLInputElement>('useRdap'),
  useFeeds: $<HTMLInputElement>('useFeeds'),
  useSafeBrowsing: $<HTMLInputElement>('useSafeBrowsing'),
  safeBrowsingKey: $<HTMLInputElement>('safeBrowsingKey'),
};

let headerIris: Iris | undefined;

function ago(ts: number): string {
  if (!ts) return 'never';
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

// ---------------------------------------------------------------- onboarding

function para(html: string): HTMLElement {
  const p = document.createElement('p');
  p.innerHTML = html;
  return p;
}

function stepBody(...nodes: (HTMLElement | string)[]): HTMLElement {
  const wrap = document.createElement('div');
  for (const n of nodes) wrap.append(typeof n === 'string' ? para(n) : n);
  return wrap;
}

function toggleRow(id: keyof typeof controls, title: string, detail: string): HTMLElement {
  const label = document.createElement('label');
  label.className = 'row toggle';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = (controls[id] as HTMLInputElement).checked;
  input.addEventListener('change', () => {
    (controls[id] as HTMLInputElement).checked = input.checked;
    (controls[id] as HTMLInputElement).dispatchEvent(new Event('change'));
  });
  const txt = document.createElement('span');
  txt.className = 'txt';
  const b = document.createElement('b');
  b.textContent = title;
  const em = document.createElement('em');
  em.textContent = detail;
  txt.append(b, em);
  label.append(input, txt);
  return label;
}

function buildOnboarding(): void {
  const host = $('onboarding');
  host.replaceChildren();

  const steps: Step[] = [
    {
      title: 'Hello — I am Iris',
      render: () => {
        const meet = document.createElement('div');
        meet.className = 'meet';
        const face = document.createElement('div');
        face.className = 'face';
        meet.appendChild(face);
        const words = stepBody(
          'I sit in your toolbar and look at every page you open. When something is off, my face changes before you have read a word.',
          'Calm and cool means I found nothing. Warm and worried means stop and read what I found.',
        );
        meet.appendChild(words);
        // Built after insertion so she can measure herself.
        setTimeout(() => {
          const iris = new Iris(face, { size: 96 });
          iris.setExpression('happy');
        }, 0);
        return meet;
      },
    },
    {
      title: 'What I actually check',
      render: () => stepBody(
        '<b>The address.</b> Is this pretending to be a brand it is not? Is the name one letter off a real one? Was it made up last week?',
        '<b>The page.</b> Does the login box send your password to a different website? Is this a copy of a real page with the buttons removed?',
        '<b>Its history.</b> Is it already on a public list of known scams? How long has it really existed?',
        'Everything I find gets a score, and every point traces back to one thing I can name. You can disagree with any of it.',
      ),
    },
    {
      title: 'What leaves your computer',
      render: () => {
        const wrap = document.createElement('div');
        wrap.append(para('Almost nothing, and you decide. The pages you visit are never sent anywhere.'));
        wrap.append(toggleRow('useRdap', 'How old a website is',
          'Sends just the domain name — never the full address, never the page.'));
        wrap.append(toggleRow('useFeeds', 'The community scam list',
          'Downloads a public list twice a day, then checks against it here on your machine.'));
        wrap.append(para('Google Safe Browsing is available too, but it is off until you turn it on — it is the one that would send full addresses to Google.'));
        return wrap;
      },
    },
    {
      title: 'You have the final say',
      render: () => stepBody(
        'If I get something wrong, tell me. Mark a site as safe and I stop scoring it. Report one and I will warn you every time.',
        'Right-click any link and choose <b>Ask Iris about this link</b> and I will check it without opening it.',
        'And if you ever want the whole story on a site — who registered it, where it is hosted, whether it can even send email — open the full site report from my popup.',
      ),
    },
  ];

  new Stepper(host, {
    steps,
    finishText: 'Start using Pagida',
    onFinish: () => {
      $('welcome').hidden = true;
      $('settings').hidden = false;
      headerIris?.react('proud', 2000);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
  });
}

// ---------------------------------------------------------------- settings

async function loadSettings(): Promise<void> {
  const s = await getSettings();
  controls.enabled.checked = s.enabled;
  controls.sensitivity.value = s.sensitivity;
  controls.showBanner.checked = s.showBanner;
  controls.siteReport.checked = s.siteReport;
  controls.useRdap.checked = s.useRdap;
  controls.useFeeds.checked = s.useFeeds;
  controls.useSafeBrowsing.checked = s.useSafeBrowsing;
  controls.safeBrowsingKey.value = s.safeBrowsingKey;
}

function wire(): void {
  const bind = (input: HTMLInputElement, key: 'enabled' | 'showBanner' | 'siteReport' | 'useRdap' | 'useFeeds' | 'useSafeBrowsing') => {
    input.addEventListener('change', () => {
      void setSettings({ [key]: input.checked });
      if (key === 'enabled') headerIris?.setExpression(input.checked ? 'happy' : 'sleepy');
    });
  };
  bind(controls.enabled, 'enabled');
  bind(controls.showBanner, 'showBanner');
  bind(controls.siteReport, 'siteReport');
  bind(controls.useRdap, 'useRdap');
  bind(controls.useFeeds, 'useFeeds');
  bind(controls.useSafeBrowsing, 'useSafeBrowsing');

  controls.sensitivity.addEventListener('change', () => {
    void setSettings({ sensitivity: controls.sensitivity.value as Sensitivity });
    headerIris?.react(controls.sensitivity.value === 'strict' ? 'angry' : 'curious', 1200);
  });
  controls.safeBrowsingKey.addEventListener('change', () =>
    void setSettings({ safeBrowsingKey: controls.safeBrowsingKey.value.trim() }));
}

async function renderFeed(): Promise<void> {
  const { feedUrls, feedUpdatedAt } = await chrome.storage.local.get(['feedUrls', 'feedUpdatedAt']);
  const count = (feedUrls ?? []).length;
  $('feed-status').textContent = count
    ? `${count.toLocaleString()} known scam pages · updated ${ago(feedUpdatedAt ?? 0)}`
    : 'not loaded yet — press Update now';
}

function markRow(mark: UserMark): HTMLLIElement {
  const li = document.createElement('li');
  const tag = document.createElement('span');
  tag.className = `tag ${mark.verdict}`;
  tag.textContent = mark.verdict === 'phishing' ? 'scam' : 'safe';
  const host = document.createElement('span');
  host.className = 'h';
  host.textContent = mark.hostname;
  const when = document.createElement('span');
  when.className = 'when';
  when.textContent = ago(mark.at);
  const remove = document.createElement('button');
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => void (async () => {
    await clearMark(mark.hostname);
    await renderMarks();
  })());
  li.append(tag, host, when, remove);
  return li;
}

async function renderMarks(): Promise<void> {
  const marks = await getMarks();
  const list = $<HTMLUListElement>('marks');
  const entries = Object.values(marks).sort((a, b) => b.at - a.at);
  list.replaceChildren(...entries.map(markRow));
  $('marks-empty').hidden = entries.length > 0;
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
  btn.textContent = 'Updating…';
  headerIris?.setExpression('thinking');
  const res = await chrome.runtime.sendMessage({ type: 'REFRESH_FEED' } satisfies Message).catch(() => null);
  btn.disabled = false;
  btn.textContent = 'Update now';
  if (!res?.ok) {
    $('feed-status').textContent = 'could not reach the list — try again in a bit';
    headerIris?.setExpression('sad');
  } else {
    await renderFeed();
    headerIris?.react('proud', 1600);
    headerIris?.setExpression('happy');
  }
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
  if (!confirm('Remove every site you have marked? I will go back to scoring them normally.')) return;
  await chrome.storage.local.set({ marks: {} });
  await renderMarks();
  headerIris?.react('surprised', 1400);
})());

$('replay').addEventListener('click', () => {
  $('settings').hidden = true;
  $('welcome').hidden = false;
  buildOnboarding();
  window.scrollTo({ top: 0 });
});

async function init(): Promise<void> {
  $('version').textContent = `Version ${__PAGIDA_VERSION__}`;
  await loadSettings();
  wire();

  headerIris = new Iris($('iris'), { size: 72 });
  headerIris.setExpression(controls.enabled.checked ? 'happy' : 'sleepy');

  const firstRun = new URLSearchParams(location.search).has('welcome');
  $('welcome').hidden = !firstRun;
  $('settings').hidden = firstRun;
  if (firstRun) buildOnboarding();

  await Promise.all([renderFeed(), renderMarks(), renderStats()]);
}

void init();
