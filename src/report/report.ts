/**
 * The site report.
 *
 * "What is this site?" is the question the popup could never answer, and it is
 * the one that actually lets a person decide for themselves. Four tabs, every
 * fact from a free public source, and every fact that could not be fetched
 * shown as "unknown" rather than quietly left out — a blank row is a lie by
 * omission when the whole point is helping someone judge a site.
 */

import { adviceFor, BAND_NAME, headlineFor } from '../core/score.js';
import { ALARMING_PORTS } from '../services/netinfo.js';
import type { SiteReport } from '../services/report.js';
import { attachScrollCompanion, Iris, expressionForBand, injectIrisCss, type TagAlong } from '../ui/iris.js';
import type { Message } from '../shared/messages.js';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const panel = (name: string) => document.querySelector<HTMLElement>(`[data-panel="${name}"]`)!;

const params = new URLSearchParams(location.search);
const target = params.get('u') ?? '';

injectIrisCss(document);
const iris = new Iris($('iris'), { size: 92, interactive: true, drift: true });
iris.setExpression('thinking');

// She follows you down the page instead of scrolling out of existence.
let tagAlong: TagAlong | undefined;
window.addEventListener('DOMContentLoaded', () => {
  tagAlong = attachScrollCompanion(document.querySelector('.hero')!, 54);
  tagAlong.setExpression('thinking');
}, { once: true });
if (document.readyState !== 'loading') {
  tagAlong = attachScrollCompanion(document.querySelector('.hero')!, 54);
  tagAlong.setExpression('thinking');
}

let report: SiteReport | undefined;

// ---------------------------------------------------------------- helpers

type Tone = 'good' | 'warn' | 'bad' | 'plain' | 'unknown';

function fact(key: string, value: string | undefined, tone: Tone = 'plain', note?: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'fact';
  const k = document.createElement('span');
  k.className = 'k';
  k.textContent = key;
  const v = document.createElement('span');
  v.className = 'v ' + (value === undefined ? 'unknown' : tone === 'plain' ? '' : tone);
  v.textContent = value ?? 'Unknown';
  if (note) {
    const n = document.createElement('span');
    n.className = 'note';
    n.textContent = note;
    v.appendChild(n);
  }
  row.append(k, v);
  return row;
}

function group(title: string, why: string, rows: HTMLElement[]): HTMLElement {
  const g = document.createElement('div');
  g.className = 'group';
  const h = document.createElement('h2');
  h.textContent = title;
  const p = document.createElement('p');
  p.className = 'why';
  p.textContent = why;
  const box = document.createElement('div');
  box.className = 'facts';
  box.append(...rows);
  g.append(h, p, box);
  return g;
}

function pending(text: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'pending';
  const spin = document.createElement('span');
  spin.className = 'spin';
  const label = document.createElement('span');
  label.textContent = text;
  wrap.append(spin, label);
  return wrap;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "3 days", "7 months", "12 years" — a person reads duration, not a day count. */
function humanAge(days: number): string {
  if (days < 1) return 'today';
  if (days < 45) return plural(days, 'day', 'days');
  if (days < 730) return plural(Math.round(days / 30.4), 'month', 'months');
  return plural(Math.floor(days / 365), 'year', 'years');
}

// ---------------------------------------------------------------- panels

function renderRisk(r: SiteReport): void {
  const p = panel('risk');
  p.replaceChildren();
  const v = r.verdict;

  if (v) {
    const callout = document.createElement('div');
    callout.className = 'callout';
    const b = document.createElement('b');
    b.textContent = headlineFor(v);
    callout.append(b, document.createTextNode(adviceFor(v)));
    p.appendChild(callout);

    if (v.signals.length === 0) {
      const none = document.createElement('p');
      none.className = 'why';
      none.textContent = 'None of my checks found anything on this site.';
      p.appendChild(none);
    }

    for (const s of v.signals) {
      const box = document.createElement('div');
      box.className = 'sig' + (s.weight < 0 ? ' credit' : '');
      const row = document.createElement('div');
      row.className = 'row';
      const t = document.createElement('span');
      t.className = 't';
      t.textContent = s.title;
      const w = document.createElement('span');
      w.className = 'w';
      w.textContent = s.weight === 0 ? '·' : `${s.weight > 0 ? '+' : ''}${s.weight}`;
      row.append(t, w);
      const d = document.createElement('p');
      d.className = 'd';
      d.textContent = s.detail;
      box.append(row, d);
      p.appendChild(box);
    }
  }

  const how = document.createElement('div');
  how.className = 'callout';
  how.style.borderLeftColor = 'var(--brand)';
  how.style.background = 'var(--brand-wash)';
  const hb = document.createElement('b');
  hb.textContent = 'How the score works';
  how.append(hb, document.createTextNode(
    'Every point above comes from one named check. Add them up and you get the score. ' +
    'Nothing is hidden and nothing is guessed by a model — you can disagree with any line of it.',
  ));
  p.appendChild(how);
}

function renderSite(r: SiteReport): void {
  const p = panel('site');
  p.replaceChildren();

  const reg = r.registration;
  const certs = r.certs;

  const age = reg?.ageDays;
  const ageTone: Tone = age === null || age === undefined ? 'unknown'
    : age < 30 ? 'bad' : age < 180 ? 'warn' : 'good';

  p.appendChild(group(
    'Who owns this name',
    'A domain is rented, and the paperwork is public. Scam sites are almost always days or weeks old, because they get taken down and the owner buys another.',
    [
      fact('Domain', r.registrableDomain),
      fact('Age', age === null || age === undefined ? undefined : humanAge(age), ageTone,
        reg?.registered ? `First registered ${reg.registered}` : undefined),
      fact('Registrar', reg?.registrar),
      fact('Registration ends', reg?.expires, 'plain'),
      fact('Last changed', reg?.lastChanged),
      fact('Registry status', reg?.statuses?.length ? reg.statuses.join(', ') : undefined),
    ],
  ));

  const certAge = certs?.ageDays;
  p.appendChild(group(
    'How long it has really been a website',
    'Anyone can buy an old domain that has never been used. Certificates are logged publicly the moment a site goes live, so this is the honest answer to "how long has this existed?".',
    [
      fact('First seen online', certAge === undefined ? undefined : humanAge(certAge),
        certAge === undefined ? 'unknown' : certAge < 30 ? 'bad' : certAge < 180 ? 'warn' : 'good',
        certs?.firstSeen ? `First certificate ${certs.firstSeen}` : undefined),
      fact('Certificates ever issued', certs?.total === undefined ? undefined : String(certs.total),
        certs?.total === undefined ? 'unknown' : certs.total < 3 ? 'warn' : 'good'),
      fact('Issued by', certs?.issuers?.length ? certs.issuers.join(', ') : undefined),
      fact('Encrypted right now', r.protocol === 'https:' ? 'Yes' : 'No',
        r.protocol === 'https:' ? 'good' : 'bad',
        r.protocol === 'https:' ? undefined : 'Anything you type can be read on the way'),
    ],
  ));

  const arch = r.archive;
  p.appendChild(group(
    'Has anyone been here before?',
    'The Internet Archive has been photographing the web since 1996. An attacker can buy an old domain, but they cannot go back and put it in the archive.',
    [
      fact('In the Internet Archive', arch === undefined ? undefined : arch.archived ? 'Yes' : 'Never captured',
        arch === undefined ? 'unknown' : arch.archived ? 'good' : 'warn'),
      fact('First captured', arch?.firstCapture, 'plain',
        arch?.ageDays === undefined ? undefined : `${humanAge(arch.ageDays)} ago`),
    ],
  ));

  const mal = r.malware;
  p.appendChild(group(
    'On any public blocklist?',
    'Two independent lists, both public. One tracks credential theft, the other tracks sites handing out malware.',
    [
      fact('Known scam list', r.verdict?.signals.some((sg) => sg.id.startsWith('phishing_feed'))
        ? 'Listed' : r.verdict ? 'Not listed' : undefined,
        r.verdict?.signals.some((sg) => sg.id.startsWith('phishing_feed')) ? 'bad' : 'good'),
      fact('Malware list', mal === undefined ? undefined : mal.listed ? 'Listed' : 'Not listed',
        mal === undefined ? 'unknown' : mal.listed ? 'bad' : 'good'),
      fact('Malware seen', mal?.tags?.length ? mal.tags.join(', ') : undefined),
      fact('First reported', mal?.firstSeen),
    ],
  ));

  p.appendChild(group(
    'Is it known?',
    'Pagida ships a list of the two thousand most visited domains in the world. Being on it does not make a site safe, but it does mean it is not a name someone invented last week.',
    [
      fact('One of the top 2,000 sites', r.wellKnown ? 'Yes' : 'No', r.wellKnown ? 'good' : 'plain'),
    ],
  ));
}

function renderHost(r: SiteReport): void {
  const p = panel('host');
  p.replaceChildren();

  const dns = r.dns;
  const host = r.host;
  const ports = host?.ports ?? [];
  const worrying = ports.filter((n) => n in ALARMING_PORTS);

  p.appendChild(group(
    'The computer serving this page',
    'Every website lives on a machine with an address. What else that machine is running says a lot about who is looking after it.',
    [
      fact('IP address', dns?.ipv4?.[0]),
      fact('All addresses', dns?.ipv4?.length ? dns.ipv4.join(', ') : undefined),
      fact('IPv6', dns?.ipv6?.length ? dns.ipv6.join(', ') : undefined),
      fact('Other names on it', host?.hostnames?.length ? host.hostnames.join(', ') : undefined),
      fact('Labels', host?.tags?.length ? host.tags.join(', ') : undefined),
    ],
  ));

  const portRows = [
    fact('Open to the internet', ports.length ? ports.join(', ') : host ? 'None found' : undefined,
      worrying.length ? 'bad' : ports.length ? 'plain' : 'good'),
  ];
  for (const n of worrying) {
    portRows.push(fact(`Port ${n}`, ALARMING_PORTS[n], 'bad'));
  }
  if (host?.vulns?.length) {
    portRows.push(fact('Known weaknesses', host.vulns.join(', '), 'bad',
      'These are public vulnerability IDs recorded against this machine'));
  }

  p.appendChild(group(
    'What else is running there',
    'This comes from Shodan, which scans the internet and publishes what it finds. Pagida never scans anything itself — it only reads what is already public.',
    portRows,
  ));

  const ip = r.ip;
  p.appendChild(group(
    'Who owns that machine',
    'An address on its own means nothing to most people. This is the company that operates it and the country it sits in — a bank in your own country hosted on a reseller in another one is worth a second look.',
    [
      fact('Network operator', ip?.asnName, ip?.isHosting ? 'warn' : 'plain'),
      fact('Network number', ip?.asn),
      fact('Internet provider', ip?.isp),
      fact('Country', ip?.country),
      fact('City', [ip?.city, ip?.region].filter(Boolean).join(', ') || undefined),
      fact('Datacentre hosting', ip?.isHosting === undefined ? undefined : ip.isHosting ? 'Yes' : 'No',
        'plain', ip?.isHosting ? 'Normal for a real business, and also where throwaway sites live' : undefined),
    ],
  ));

  p.appendChild(group(
    'Who answers for the name',
    'The nameservers are whoever the owner pays to point the name at a machine.',
    [
      fact('Nameservers', dns?.nameservers?.length ? dns.nameservers.join(', ')
        : r.registration?.nameservers?.length ? r.registration.nameservers.join(', ') : undefined),
      fact('Alias for', dns?.cname?.length ? dns.cname.join(', ') : undefined, 'plain',
        dns?.cname?.length ? 'This name points at another one — usually a CDN or a site builder' : undefined),
    ],
  ));
}

/** What the page is made of. Costs no network call and no privacy. */
function renderTech(r: SiteReport): void {
  const p = panel('tech');
  p.replaceChildren();
  const t = r.tech;

  if (!t) {
    const msg = document.createElement('p');
    msg.className = 'why';
    msg.textContent =
      'I have not read this page itself — open the report from the Pagida popup while you are on the site and this fills in.';
    p.appendChild(msg);
    return;
  }

  p.appendChild(group(
    'What this page says it is',
    'Straight from the page. Worth comparing against what the address claims.',
    [
      fact('Title', t.title),
      fact('Description', t.description),
      fact('Built with', t.generator),
      fact('Technology', t.frameworks?.length ? t.frameworks.join(', ') : undefined),
    ],
  ));

  const third = t.externalScriptHosts ?? [];
  p.appendChild(group(
    'Whose code runs here',
    'Every site on this list can change what this page does. A login page pulling code from a dozen strangers is a login page worth being careful on.',
    [
      fact('Outside code sources', third.length ? String(third.length) : t.resourceCounts ? 'None' : undefined,
        third.length > 8 ? 'warn' : third.length ? 'plain' : 'good'),
      fact('They are', third.length ? third.join(', ') : undefined),
      fact('Scripts on the page', t.resourceCounts ? String(t.resourceCounts.scripts) : undefined),
      fact('Frames', t.resourceCounts ? String(t.resourceCounts.iframes) : undefined,
        (t.resourceCounts?.iframes ?? 0) > 3 ? 'warn' : 'plain'),
    ],
  ));

  p.appendChild(group(
    'What it is asking for',
    'Forms are how a page takes something from you.',
    [
      fact('Forms', t.formCount === undefined ? undefined : String(t.formCount)),
      fact('Asks for a password', t.hasPasswordField === undefined ? undefined
        : t.hasPasswordField ? 'Yes' : 'No', t.hasPasswordField ? 'warn' : 'plain'),
      fact('Links off this site', t.externalLinkHosts?.length ? t.externalLinkHosts.slice(0, 8).join(', ') : undefined),
    ],
  ));
}

function renderMail(r: SiteReport): void {
  const p = panel('mail');
  p.replaceChildren();
  const dns = r.dns;

  const spfTone: Tone = dns?.hasSpf === undefined ? 'unknown' : dns.hasSpf ? 'good' : 'warn';
  const dmarcTone: Tone = dns?.hasDmarc === undefined ? 'unknown'
    : !dns.hasDmarc ? 'warn'
    : dns.dmarcPolicy === 'reject' ? 'good'
    : dns.dmarcPolicy === 'quarantine' ? 'good' : 'warn';

  p.appendChild(group(
    'Can this domain send you email?',
    'Real organisations publish records saying which servers may send email in their name. A domain with none of that is trivial to impersonate — and a scam domain rarely bothers.',
    [
      fact('Set up to receive email', dns?.hasMx === undefined ? undefined : dns.hasMx ? 'Yes' : 'No',
        dns?.hasMx === undefined ? 'unknown' : dns.hasMx ? 'plain' : 'warn'),
      fact('Mail servers', dns?.mxHosts?.length ? dns.mxHosts.join(', ') : undefined),
      fact('SPF published', dns?.hasSpf === undefined ? undefined : dns.hasSpf ? 'Yes' : 'No', spfTone,
        dns?.hasSpf === false ? 'Anyone can send email claiming to be this domain' : undefined),
      fact('DMARC published', dns?.hasDmarc === undefined ? undefined
        : dns.hasDmarc ? `Yes — policy: ${dns.dmarcPolicy ?? 'none'}` : 'No', dmarcTone,
        dns?.dmarcPolicy === 'none'
          ? 'Published, but it asks mail providers to do nothing about forgeries'
          : undefined),
    ],
  ));

  const note = document.createElement('div');
  note.className = 'callout';
  note.style.borderLeftColor = 'var(--brand)';
  note.style.background = 'var(--brand-wash)';
  const b = document.createElement('b');
  b.textContent = 'Why this is on a phishing tool';
  note.append(b, document.createTextNode(
    'Most phishing arrives by email. If a domain has no SPF and no DMARC, forging mail from it costs an attacker nothing — ' +
    'so a bank or a government service with those missing is worth a second look, and a brand-new domain with them missing is exactly what you would expect.',
  ));
  p.appendChild(note);
}

// ---------------------------------------------------------------- shell

function renderHeader(r: SiteReport): void {
  $('domain').textContent = r.registrableDomain;
  $('full-url').textContent = r.url;

  const v = r.verdict;
  if (v) {
    document.documentElement.setAttribute('data-band', v.band);
    iris.setBand(v.band);
    iris.setExpression(expressionForBand(v.band));
    tagAlong?.setBand(v.band);
    tagAlong?.setExpression(expressionForBand(v.band));
    $('verdict').textContent = headlineFor(v);
    $('score-ring').hidden = false;
    $('score').textContent = String(v.score);
    $('band-name').textContent = BAND_NAME[v.band];
  } else {
    $('verdict').textContent = 'I could not score this one.';
    iris.setExpression('sad');
  }

  const missing = r.unavailable;
  $('sources').textContent =
    'Sources: rdap.org · cloudflare-dns.com · internetdb.shodan.io · crt.sh · ipwho.is · archive.org · urlhaus.abuse.ch' +
    (missing.length ? ` — no answer from: ${missing.join(', ')}` : '');
}

function showTab(name: string): void {
  document.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => {
    p.hidden = p.dataset.panel !== name;
  });
  document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.tab === name));
  });
}

document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => {
  b.addEventListener('click', () => showTab(b.dataset.tab!));
});

// ---------------------------------------------------------------- load

async function load(): Promise<void> {
  if (!target) {
    $('domain').textContent = 'No site given';
    $('verdict').textContent = 'Open this from the Pagida popup on a page you want to check.';
    iris.setExpression('sleepy');
    return;
  }

  try { $('domain').textContent = new URL(target).hostname; } catch { /* keep the placeholder */ }
  $('full-url').textContent = target;
  for (const name of ['risk', 'site', 'host', 'mail', 'tech']) {
    panel(name).replaceChildren(pending('Looking this up…'));
  }

  const res = await chrome.runtime.sendMessage({ type: 'BUILD_REPORT', url: target } satisfies Message)
    .catch(() => null);

  if (!res?.ok || !res.report) {
    iris.setExpression('sad');
    $('verdict').textContent = 'I could not gather anything about this site.';
    for (const name of ['risk', 'site', 'host', 'mail', 'tech']) {
      const p = panel(name);
      p.replaceChildren();
      const msg = document.createElement('p');
      msg.className = 'why';
      msg.textContent = 'Nothing came back. Check your connection and press "Check again".';
      p.appendChild(msg);
    }
    return;
  }

  report = res.report as SiteReport;
  renderHeader(report);
  renderRisk(report);
  renderSite(report);
  renderHost(report);
  renderMail(report);
  renderTech(report);
}

$('recheck').addEventListener('click', () => {
  iris.setExpression('thinking');
  void load();
});

$('report-site').addEventListener('click', () => void (async () => {
  iris.react('proud', 1800);
  await chrome.runtime.sendMessage({ type: 'MARK_SITE', url: target, verdict: 'phishing' } satisfies Message);
  $('verdict').textContent = 'Reported. I will warn you about this site from now on.';
})());

$('trust-site').addEventListener('click', () => void (async () => {
  iris.react('sad', 1800);
  await chrome.runtime.sendMessage({ type: 'MARK_SITE', url: target, verdict: 'safe' } satisfies Message);
  $('verdict').textContent = 'Alright — I will stop scoring this one.';
})());

void load();
void report;
