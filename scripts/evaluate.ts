/**
 * Evaluation harness.
 *
 * Measures how well the URL-tier rules separate confirmed phishing URLs from
 * legitimate ones, and prints precision / recall / F1 at every threshold.
 *
 * Two deliberate constraints on what this measures:
 *
 *  1. **URL tier only.** DOM rules need the page to be open, and opening a live
 *     phishing page to measure it is not something a defensive tool should do.
 *     Reputation rules are excluded too — scoring OpenPhish URLs against the
 *     OpenPhish blocklist would be circular and would produce a meaningless 100%.
 *
 *  2. **Two negative sets.** Top-site home pages are an easy negative: short,
 *     clean, no path. So the harness also runs a hand-built set of *real brand
 *     login URLs* — long, path-heavy, full of words like "signin" and "verify" —
 *     which is where a naive URL heuristic falls over. The hard-negative number
 *     is the one worth quoting.
 *
 * Run: npm run evaluate
 */
import { writeFile } from 'node:fs/promises';
import { evidenceFromUrl } from '../src/core/evidence.js';
import { evaluate } from '../src/core/score.js';
import { URL_RULES } from '../src/core/rules/url.js';
import { BAND_THRESHOLDS } from '../src/core/score.js';
import { ALLOWLIST_SIZE, ALLOWLIST_SOURCE_RANK_LIMIT } from '../src/core/data/allowlist.js';

const OPENPHISH = 'https://raw.githubusercontent.com/openphish/public_feed/main/feed.txt';
const TOP_SITES = 'https://raw.githubusercontent.com/zer0h/top-1000000-domains/master/top-10000-domains';

/**
 * Negatives are drawn from the ranks immediately *below* the domains bundled
 * as the engine's allowlist. Measuring against the same domains the engine is
 * told to trust would be circular and would produce a flattering, meaningless
 * number.
 */
const NEGATIVE_RANK_FROM = ALLOWLIST_SOURCE_RANK_LIMIT;
const NEGATIVE_RANK_TO = ALLOWLIST_SOURCE_RANK_LIMIT + 2000;

/**
 * Real login and account URLs from services people actually use. These are the
 * negatives that matter: if the engine cannot keep these clean, it is useless in
 * practice no matter how well it scores on home pages.
 */
const HARD_NEGATIVES = [
  'https://www.paypal.com/au/signin?returnUri=%2Fmyaccount%2Fsummary',
  'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=abc&response_type=code',
  'https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Fmail.google.com',
  'https://appleid.apple.com/sign-in',
  'https://www.commbank.com.au/digital/netbank/login',
  'https://ib.nab.com.au/nabib/index.jsp',
  'https://banking.westpac.com.au/wbc/banking/handler',
  'https://www.anz.com.au/internet-banking/login/',
  'https://my.gov.au/en/create-account-and-linking/create-account',
  'https://auspost.com.au/mypost/track/#/details/ABC123456789',
  'https://www.amazon.com.au/ap/signin?openid.return_to=https%3A%2F%2Fwww.amazon.com.au',
  'https://www.netflix.com/login?nextpage=https%3A%2F%2Fwww.netflix.com%2Fbrowse',
  'https://github.com/login?return_to=%2FAryanDhingraa%2Fpagida',
  'https://www.linkedin.com/checkpoint/lg/login-submit',
  'https://www.facebook.com/login/device-based/regular/login/',
  'https://secure.telstra.com.au/customer-login',
  'https://www.ebay.com.au/signin/?ru=https%3A%2F%2Fwww.ebay.com.au%2F',
  'https://id.atlassian.com/login?continue=https%3A%2F%2Fstart.atlassian.com',
  'https://signin.aws.amazon.com/signin?redirect_uri=https%3A%2F%2Fconsole.aws.amazon.com',
  'https://www.dropbox.com/login?cont=%2Fhome',
  'https://account.adobe.com/security',
  'https://www.rmit.edu.au/students/student-essentials/login',
  'https://www.instagram.com/accounts/login/?next=%2F',
  'https://discord.com/login?redirect_to=%2Fchannels%2F%40me',
  'https://www.coinbase.com/signin',
  'https://mail.proton.me/u/0/login',
  'https://www.docusign.net/Member/EmailStart.aspx?a=abc-123',
  'https://zoom.us/signin#/login',
  'https://www.medicare.gov/account/login',
  'https://www.booking.com/mypropertyreservations.en-gb.html',
  'https://portal.office.com/account/verify-identity?flow=signin',
  'https://secure.bendigobank.com.au/banking/login',
  'https://myaccount.optus.com.au/login',
  'https://www.woolworths.com.au/shop/securelogin',
  'https://identity.afterpay.com/login?locale=en-AU',
  'https://support.apple.com/en-au/billing',
  'https://help.netflix.com/en/node/41049',
  'https://www.westpac.com.au/security/report-a-scam/',
  'https://www.scamwatch.gov.au/report-a-scam',
  'https://blog.cloudflare.com/how-we-stopped-a-paypal-phishing-campaign/',
];

interface Sample { url: string; score: number }

function scoreUrl(url: string): number | null {
  const e = evidenceFromUrl(url);
  if (!e) return null;
  return evaluate(e, { rules: URL_RULES }).score;
}

async function fetchLines(url: string, limit = Infinity): Promise<string[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const text = await res.text();
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .slice(0, limit);
}

function collect(urls: string[]): Sample[] {
  const out: Sample[] = [];
  for (const url of urls) {
    const score = scoreUrl(url);
    if (score !== null) out.push({ url, score });
  }
  return out;
}

interface Metrics {
  threshold: number;
  tp: number; fp: number; tn: number; fn: number;
  precision: number; recall: number; f1: number; accuracy: number;
}

function metricsAt(threshold: number, positives: Sample[], negatives: Sample[]): Metrics {
  const tp = positives.filter((s) => s.score >= threshold).length;
  const fn = positives.length - tp;
  const fp = negatives.filter((s) => s.score >= threshold).length;
  const tn = negatives.length - fp;
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const accuracy = (tp + tn) / (tp + tn + fp + fn);
  return { threshold, tp, fp, tn, fn, precision, recall, f1, accuracy };
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function bar(label: string, samples: Sample[]): string {
  const buckets = new Array(10).fill(0);
  for (const s of samples) buckets[Math.min(9, Math.floor(s.score / 10))]++;
  const max = Math.max(...buckets, 1);
  return buckets
    .map((n, i) => {
      const blocks = '█'.repeat(Math.round((n / max) * 28)) || '';
      return `  ${String(i * 10).padStart(3)}-${String(i * 10 + 9).padEnd(3)} ${blocks} ${n}`;
    })
    .join('\n')
    .replace(/^/, `${label}\n`);
}

async function main(): Promise<void> {
  console.log('pagida evaluation — URL-tier rules only\n');

  const [phishRaw, topRaw] = await Promise.all([
    fetchLines(OPENPHISH),
    fetchLines(TOP_SITES, NEGATIVE_RANK_TO),
  ]);

  const positives = collect(phishRaw);
  const easyNegatives = collect(
    topRaw.slice(NEGATIVE_RANK_FROM, NEGATIVE_RANK_TO).map((d) => `https://${d}/`),
  );
  const hardNegatives = collect(HARD_NEGATIVES);
  const allNegatives = [...easyNegatives, ...hardNegatives];

  console.log(`positives        ${positives.length}  (OpenPhish community feed, fetched today)`);
  console.log(`easy negatives   ${easyNegatives.length}  (top sites, ranks ${NEGATIVE_RANK_FROM + 1}-${NEGATIVE_RANK_TO})`);
  console.log(`hard negatives   ${hardNegatives.length}  (real brand login and account URLs)`);
  console.log(`allowlist        ${ALLOWLIST_SIZE} domains (ranks 1-${ALLOWLIST_SOURCE_RANK_LIMIT}) — disjoint from the negatives above\n`);

  const shipping = BAND_THRESHOLDS.suspicious;
  const sweep: Metrics[] = [];
  for (let t = 5; t <= 100; t += 5) sweep.push(metricsAt(t, positives, allNegatives));
  const best = sweep.reduce((a, b) => (b.f1 > a.f1 ? b : a));
  const atShipping = metricsAt(shipping, positives, allNegatives);
  const hardOnly = metricsAt(shipping, positives, hardNegatives);

  console.log('threshold sweep (all negatives)');
  console.log('  thr | precision | recall  |   F1    | FP | FN');
  console.log('  ----+-----------+---------+---------+----+----');
  for (const m of sweep) {
    const star = m.threshold === shipping ? '*' : ' ';
    console.log(
      `  ${String(m.threshold).padStart(3)}${star}| ${pct(m.precision).padStart(9)} | ` +
      `${pct(m.recall).padStart(7)} | ${pct(m.f1).padStart(7)} | ` +
      `${String(m.fp).padStart(2)} | ${String(m.fn).padStart(2)}`,
    );
  }
  console.log('\n  * = the threshold Pagida actually ships with (band: suspicious)\n');

  console.log('metrics at each band boundary');
  for (const [name, t] of Object.entries(BAND_THRESHOLDS)) {
    const m = metricsAt(t, positives, allNegatives);
    console.log(
      `  ${name.padEnd(11)} (>=${String(t).padStart(2)})  precision ${pct(m.precision).padStart(6)}  ` +
      `recall ${pct(m.recall).padStart(6)}  F1 ${pct(m.f1).padStart(6)}  FP ${m.fp}/${allNegatives.length}`,
    );
  }
  console.log();

  console.log(`at the shipping threshold (${shipping}):`);
  console.log(`  precision  ${pct(atShipping.precision)}   of the pages Pagida flags, this many really are phishing`);
  console.log(`  recall     ${pct(atShipping.recall)}   of the known phishing pages, this many get flagged`);
  console.log(`  F1         ${pct(atShipping.f1)}`);
  console.log(`  confusion  TP ${atShipping.tp}  FP ${atShipping.fp}  TN ${atShipping.tn}  FN ${atShipping.fn}\n`);

  console.log(`against hard negatives only (real login pages): ${hardOnly.fp} false positive(s) out of ${hardNegatives.length}\n`);
  console.log(`best F1 in the sweep: ${pct(best.f1)} at threshold ${best.threshold}\n`);

  console.log(bar('score distribution — phishing', positives));
  console.log();
  console.log(bar('score distribution — legitimate', allNegatives));

  const worstNegatives = [...allNegatives].sort((a, b) => b.score - a.score).slice(0, 8);
  console.log('\nhighest-scoring legitimate URLs (these are the false-positive risk):');
  for (const s of worstNegatives) console.log(`  ${String(s.score).padStart(3)}  ${s.url.slice(0, 90)}`);

  const missed = [...positives].sort((a, b) => a.score - b.score).slice(0, 8);
  console.log('\nlowest-scoring phishing URLs (these are what the URL tier misses):');
  for (const s of missed) console.log(`  ${String(s.score).padStart(3)}  ${s.url.slice(0, 90)}`);

  await writeFile(
    'eval-results.json',
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        tier: 'url-only',
        counts: {
          positives: positives.length,
          easyNegatives: easyNegatives.length,
          hardNegatives: hardNegatives.length,
        },
        shippingThreshold: shipping,
        atShipping,
        hardNegativesOnly: hardOnly,
        best,
        sweep,
      },
      null,
      2,
    ),
  );
  console.log('\nwrote eval-results.json');
}

await main();
