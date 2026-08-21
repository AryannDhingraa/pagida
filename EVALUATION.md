# Evaluation

Pagida's detection engine is measured, not asserted. This document is the
methodology; `npm run evaluate` reproduces the numbers against live data, so
they move as the threat landscape does.

## What is being measured

**The URL tier only** — 21 rules that work from the address alone, with no page
content and no network lookups.

Two exclusions are deliberate:

- **Page-content rules are excluded** because measuring them means opening live
  phishing pages, and a defensive tool should not be doing that. Their
  contribution is therefore not in these numbers at all, which makes every
  figure below a *floor* rather than a ceiling.
- **Reputation rules are excluded** because scoring OpenPhish URLs against the
  OpenPhish blocklist would be circular. It would produce a flattering 100% that
  measured nothing.

## The data

| Set | Size | Source |
|---|---:|---|
| Positives | 300 | [OpenPhish community feed](https://github.com/openphish/public_feed), fetched at run time |
| Easy negatives | 2,000 | Top-sites ranking, ranks 2,001–4,000, home pages |
| Hard negatives | 40 | Hand-built list of real brand login and account URLs |

### Why the negatives start at rank 2,001

Pagida bundles the top 2,000 domains as an allowlist that suppresses its
lookalike rules — `telegraph.co.uk` sits two edits from `telegram`, and no
amount of weight tuning fixes that class of false positive. Measuring against
the same domains the engine has been told to trust would be circular, so the
negative set is drawn from **below** the allowlist. The two sets never overlap.

### Why the hard negatives matter more than the easy ones

A top-site home page is an easy negative: short, no path, no query string. A
real login URL is not:

```
https://www.paypal.com/au/signin?returnUri=%2Fmyaccount%2Fsummary
https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=…
https://www.commbank.com.au/digital/netbank/login
https://www.westpac.com.au/security/report-a-scam/
```

Long, path-heavy, and full of exactly the words a naive heuristic keys on —
*signin*, *login*, *secure*, *verify*, *scam*. These are where a URL-based
phishing detector normally falls apart, and they are the number worth quoting.

## Results

| Band | Threshold | Precision | Recall | F1 | False positives |
|---|---:|---:|---:|---:|---:|
| `WORTH_A_LOOK` | ≥15 | 94.5% | 62.7% | 75.4% | 11 / 2,040 |
| `SUSPICIOUS` | ≥30 | 97.8% | 30.3% | 46.3% | 2 / 2,040 |
| `LIKELY_PHISHING` | ≥55 | 100% | 2.3% | 4.6% | 0 / 2,040 |

**Hard negatives: 0 false positives out of 40.**

## How the bands were chosen

Not by picking round numbers, and not by maximising F1.

Maximum F1 in the sweep sits at threshold 5 (82.2%), and shipping there would be
a mistake: it flags 51 of 2,040 legitimate sites. A phishing warning that fires
on one site in forty is a warning people learn to click through, and a tool
people click through is worse than no tool at all.

So the bands are chosen by **what each one costs the user**:

- **≥15 shows a small badge.** A badge is cheap, so it can afford 62.7% recall
  at a 0.5% false-positive rate. This is where most real detection happens.
- **≥30 escalates the badge.** Nearly 98% precision — when this fires, it is
  almost always right.
- **≥55 interrupts the page with a warning bar.** Interrupting is expensive, so
  this band is set where the URL tier alone effectively cannot reach it. In
  practice the top band is triggered by page-content evidence or a blocklist
  match, not by address heuristics — which is exactly the intent.

## What these numbers do not mean

- **Recall is not detection rate.** 30% recall at the shipping threshold is
  measured *without* page content and *without* the blocklist, which are the two
  things that catch the phishing the address tier misses. Real-world detection
  with all three tiers active is higher; it is also much harder to measure
  honestly, so it is not claimed here.
- **300 positives is a small sample.** The OpenPhish public feed is a rolling
  snapshot, not a corpus. Run the harness on a different day and the numbers
  move by a few points.
- **The feed is biased towards what OpenPhish detects.** Phishing that nobody
  has reported yet is, by construction, absent from the positive set.

## What the misses look like

The URL tier's blind spot is consistent and worth understanding:

```
https://ydwell.com.tw/wp-includes/sitemaps/kouvytj/rgnup1c/index.html
https://avanteshipping.com/wp-includes/html-js
https://autoscoutdealer24.com/
https://vazadasfloripa.criarsite.online/
```

These are compromised legitimate sites and free site-builders. The domain is
old, the registration is clean, the TLD is ordinary — the address is genuinely
unremarkable. Only the *page* gives it away, which is precisely why Pagida has
a page-content tier at all.

The `/wp-includes/` rule was added after seeing this pattern in the data, and it
is the single largest recall improvement in the project: pages are never
legitimately served from a WordPress system folder, so when one is, the site has
almost certainly been broken into.

## Reproducing

```bash
npm install
npm run evaluate
```

The harness fetches live data, so results will differ from the run below. Raw
output is written to `eval-results.json`.

## Latest recorded run

```
positives        300  (OpenPhish community feed, fetched today)
easy negatives   2000  (top sites, ranks 2001-4000)
hard negatives   40  (real brand login and account URLs)
allowlist        1982 domains (ranks 1-2000) — disjoint from the negatives above

threshold sweep (all negatives)
  thr | precision | recall  |   F1    | FP | FN
  ----+-----------+---------+---------+----+----
    5 |     82.8% |   81.7% |   82.2% | 51 | 55
   10 |     82.1% |   75.0% |   78.4% | 49 | 75
   15 |     94.5% |   62.7% |   75.4% | 11 | 112
   20 |     94.2% |   53.7% |   68.4% | 10 | 139
   25 |     98.4% |   41.3% |   58.2% |  2 | 176
   30*|     97.8% |   30.3% |   46.3% |  2 | 209
   35 |    100.0% |   22.0% |   36.1% |  0 | 234
   40 |    100.0% |   13.0% |   23.0% |  0 | 261
   45 |    100.0% |    8.7% |   16.0% |  0 | 274
   50 |    100.0% |    2.3% |    4.6% |  0 | 293
   55 |    100.0% |    2.3% |    4.6% |  0 | 293
   60 |    100.0% |    0.7% |    1.3% |  0 | 298
   65 |    100.0% |    0.7% |    1.3% |  0 | 298
   70 |    100.0% |    0.0% |    0.0% |  0 | 300
   75 |    100.0% |    0.0% |    0.0% |  0 | 300
   80 |    100.0% |    0.0% |    0.0% |  0 | 300
   85 |    100.0% |    0.0% |    0.0% |  0 | 300
   90 |    100.0% |    0.0% |    0.0% |  0 | 300
   95 |    100.0% |    0.0% |    0.0% |  0 | 300
  100 |    100.0% |    0.0% |    0.0% |  0 | 300

  * = the threshold Pagida actually ships with (band: suspicious)

metrics at each band boundary
  caution     (>=15)  precision  94.5%  recall  62.7%  F1  75.4%  FP 11/2040
  suspicious  (>=30)  precision  97.8%  recall  30.3%  F1  46.3%  FP 2/2040
  danger      (>=55)  precision 100.0%  recall   2.3%  F1   4.6%  FP 0/2040

at the shipping threshold (30):
  precision  97.8%   of the pages Pagida flags, this many really are phishing
  recall     30.3%   of the known phishing pages, this many get flagged
  F1         46.3%
  confusion  TP 91  FP 2  TN 2038  FN 209

against hard negatives only (real login pages): 0 false positive(s) out of 40

best F1 in the sweep: 82.2% at threshold 5

score distribution — phishing
    0-9   ████████████████████████████ 75
   10-19  ████████████████████████ 64
   20-29  ██████████████████████████ 70
   30-39  ███████████████████ 52
   40-49  ████████████ 32
   50-59  ██ 5
   60-69  █ 2
   70-79   0
   80-89   0
   90-99   0

score distribution — legitimate
    0-9   ████████████████████████████ 1991
   10-19  █ 39
   20-29   8
   30-39   2
   40-49   0
   50-59   0
   60-69   0
   70-79   0
   80-89   0
   90-99   0

highest-scoring legitimate URLs (these are the false-positive risk):
   30  https://lexpress.fr/
   30  https://mixcloud.com/
   22  https://kt9267.com/
   22  https://dy2018.com/
   22  https://7769domain.com/
   22  https://1001fonts.com/
   22  https://1000mg.jp/
   22  https://18374ir.com/

lowest-scoring phishing URLs (these are what the URL tier misses):
    0  https://autoscoutdealer24.com/
    0  https://vazadasfloripa.criarsite.online/
    0  https://danaa-iindonesiaa.ivv.my.id/
    0  https://bet365koreasite.com/
    0  https://www.roblox.ly/users/3869760597/profile
    0  https://www.every-daywinner.com/?override=34
    0  https://www.roblox.com.mu/communities/3869778285/beans-33
    0  https://www.clientesexculiso.lat/

wrote eval-results.json
```
