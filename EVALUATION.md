# Evaluation

## v6 hardening: today's live phishing (12 November 2026)

Measured with `tools/harness/compare.cjs`, the committed v6 build and this
build in the same Chromium, the same page, the same moment. The Pagida service
and both blocklists were off, so nothing could mark its own homework. Phishing
pages are the first 240 hosts in that morning's OpenPhish feed; a page counts
only if it was still serving something other than a takedown or error page.

| Live phishing pages | Committed v6 | This build |
|---|---:|---:|
| First pass, 108 live | 67 at Suspicious or worse (62.0%), 89 flagged (82.4%) | same build |
| Rerun with the new rules, 73 still live | 42 (57.5%), 60 flagged (82.2%), 4 Likely phishing | 44 (60.3%), 61 flagged (83.6%), 6 Likely phishing |

What the misses were: sign-in pages for banks and telcos no brand list knows
(Banco de la Nación, DKB, Orange, SwissPass, Interbank), mostly on free hosts
(vercel.app, pages.dev, netlify.app, zapier.app). The new rules name that
directly. Most of those pages were taken down between the two passes, which is
why the gain on the rerun is small: the rule fired on one of the few still up.

Not measured yet in a browser: the sign-in copy rule, the site memory and the
email-click context (each needs history the harness does not have), and the
online-form password rule. All have unit tests with their honest twins.

This run was made over a phone hotspot. A campus network blocked most
phishing pages outright, so benchmarks must run on an unfiltered connection.

### Final pass, with the retrained models (same evening)

The same feed, all 242 hosts, retried after the models were retrained. 101
pages were still live and scored by both builds.

| 101 live phishing pages | Committed v6 | This build |
|---|---:|---:|
| Suspicious or worse | 65 (64.4%) | 69 (68.3%) |
| Flagged at any level | 85 (84.2%) | 87 (86.1%) |
| Likely phishing | 11 | 13 |

Five pages went up and none went down: a DKB sign-in page on a .bj domain and
a SwissPass page on cleverapps.io now reach Likely phishing, a Coinbase copy on
zapier.app and a Banco Pichincha page on replit.app reach Suspicious.

**False alarms, same build, same evening.** 463 real sites with the feeds on,
353 loaded and scored by both builds. Committed v6: 345 clean, 4 Worth a look,
4 Suspicious. This build: 344 clean, 7 Worth a look, 2 Suspicious. phys.org and
index.hu dropped from Suspicious to Worth a look: both are top sites whose login
form posts to another domain, and top sites are now never pushed past Worth a
look by guesswork alone (before, that cap needed a domain age, and top sites
are never looked up). leadpages.com showed as Worth a look once because
its domain-age lookup failed in that one run; rerun alone, both builds call it
clean. The two left at Suspicious are domains under a month old and are the
same in both builds.

**The retrained models.** Both now keep their 12,000 strongest weights instead
of 6,000, chosen on held-out data with the false-positive rate as a hard limit.
Same training and test split for both sizes:

| Held-out data | 6,000 weights | 12,000 weights |
|---|---:|---:|
| Emails: AUC, caught, false positives | 0.992, 94.0%, 1.98% | 0.993, 94.9%, 1.77% |
| Web pages: AUC, caught, false positives | 0.976, 91.2%, 6.90% | 0.979, 92.4%, 6.75% |

The whole email engine with the new email model: 75.7% of Nazario 2025
phishing warned (was 75.5%), 68.0% of 2024 (was 67.5%), and still 1 false
warning in 844 held-out normal emails. On the 30 live phishing sign-in pages
from the run above, the new page model scored 30 as phishing, the old one 29.

**Speed.** Measured with `tools/harness/timing.cjs` on a fresh profile, from
the moment the HTML arrives to the moment the worker has a verdict: the median
went from about 1,000 ms to about 145 ms, and copied sign-in pages from 4.2 s
to 0.14 s. No verdict changed.

## v6: email (4 November 2026)

`scripts/evaluate-email.ts` runs the email engine over labelled mail and
counts how often it would show a warning (any named reason) and how often that
warning is "Likely phishing". Link checks are address-only and the blocklists
are empty, which is what Pagida does offline. QR codes are not part of it (the
corpora carry no images); the browser test below covers them.

| Set | Emails | Warned | "Likely phishing" |
|---|---:|---:|---:|
| Phishing: Nazario 2025, never trained on | 481 | **75.5%** | 56.5% |
| Same, without the reader's own address | 481 | 68.6% | 48.0% |
| Phishing: Nazario 2024 (the model trained on it) | 403 | 67.5% | 56.3% |
| Same, without the reader's own address | 403 | 61.5% | 47.9% |
| Legitimate: SpamAssassin, held out from training | 844 | **0.1%** (1) | 0% |
| Legitimate: all SpamAssassin mail (rules check) | 4,150 | 0.3% (11) | 0.02% (1) |

How to read it:

- **The reader's own address matters.** Every Nazario email was sent to one
  person at one company, and a third of the 2025 set is "your company's IT
  team" mail sent from somewhere else. Pagida catches that by comparing the
  sender with your own domain, which it reads from Gmail's tab title or
  Outlook's To line. A personal Gmail or Outlook.com reader has no company
  domain to compare with, so the rows without it are the numbers for them.
- **2025 was looked at while the rules were written**, so it is not a clean
  test of the rules (it is a clean test of the model). 2024 was not looked at
  for the rules, but the model trained on it. Neither is perfect; together
  they bracket it.
- **The legitimate mail is from 2002.** Held out means the model never trained
  on it. Of the 11 warnings in the full set, 8 are links the web engine
  flags (a `yahoo.comm` typo, a parody of microsoft.com, qmail.org as a
  near-miss for gmail.com), and the one "Likely phishing" is an `index.html`
  attached to a developer mailing list: harmless there, and exactly what an
  attached phishing page looks like. Modern newsletters are the likeliest false alarm, which is
  why the model can never warn on its own.

What the 2025 warnings were, by top reason: your organisation's name from
outside (168), a brand name on the wrong address (57), callback scams (37),
wording plus an unknown link (31), fake mailbox notices (26), links to IPFS,
buckets or free hosts (24), dangerous attachments (15), payment scams (4).

What is still missed: fake receipts with no link and no phone number in the
text (the number is in an image), well-crafted mail sent through real
services (a real DocuSign or PayPal invoice with a scam in the note), and
non-English lures the model has seen little of.

**In the browser** (`tools/harness/mail-e2e.cjs`): mock Gmail and Outlook
pages served as mail.google.com and outlook.office.com. A CommBank phish from
Gmail, a fake Microsoft 365 password notice and a "mailbox full" notice to
IPFS all got a "Likely phishing" card with their links held behind a confirm;
a real CommBank statement and a real Microsoft renewal got nothing; a QR code
in an image was read in the worker.

**The models** (`scripts/train-text-models.py`), on held-out data: email AUC
0.992, 96.6% precision and 94.0% recall at 0.5; web pages AUC 0.976, 85.3%
precision and 91.2% recall, 6.9% false positives. The page model's false
positive rate is why it only counts on unknown sites that ask for a secret.

**The web engine, v5 against v6** (`tools/harness/compare.cjs`, same day,
Pagida service off in both). On 345 real sites scored by both builds, v6 gave
the same answer as v5 on every one but a single http-only site that moved from
"Nothing found" to "Worth a look". That run found one "Likely phishing" on a
real site in **both** builds: index.hu, whose hidden log-in box posts to its
own account service on another domain. v6 now treats that as single sign-on on
a top-10,000 site (a hacked site posting to a relay is still caught by the
relay rule). On 194 live pages from that morning's OpenPhish feed, blocklists
off, v6 flagged 178 (v5: 178), 86 at "Suspicious" or worse (v5: 84) and 8 at
"Likely phishing" (v5: 7), and scored none lower than v5. All nine attack
pages gave the same results as in v5.

---

## v5: the whole engine, in a real browser (4 November 2026)

The URL-only numbers further down never measured false alarms on real pages,
and every false alarm users reported came from the page-content layer. v5 is
measured end to end instead: `tools/harness/compare.cjs` loads the old and the
new build into the same headless Chromium, visits each page once, and records
both verdicts for the same page at the same moment. The Pagida service is
switched off in both before the first visit.

**Legitimate sites**: 164 commonly used sites (banks, government, shopping,
streaming, SaaS log-in pages) plus 300 random Tranco top-50,000 home pages.
327 loaded and were scored by both builds.

| On 327 real sites | v3.0.1 | v5.0.0 |
|---|---:|---:|
| "Likely phishing" | 15 | 0 |
| "Suspicious" | 9 | 2 |
| "Worth a look" | 36 | 9 |
| Iris popped up on the page | 15 | 0 |
| Real log-in pages called "Likely phishing" (41) | 15 | 0 |
| Your own network (router, localhost dev site, local app) | 2 "Likely phishing", 1 "Worth a look" | all clean, never looked up |

The two v5 "Suspicious" results are week-old domains with nothing else wrong;
neither makes Iris appear.

**Phishing**: one URL per host from that morning's OpenPhish feed (234), with
both blocklists switched off so they cannot mark their own homework. 172 were
still serving something other than a takedown or error page.

| On 172 live phishing pages, engine only | v3.0.1 | v5.0.0 |
|---|---:|---:|
| Flagged at any level | 149 | 154 |
| "Suspicious" or worse | 111 | 119 |
| "Likely phishing" | 18 | 19 |
| Iris popped up on the page | 18 | 42 |

v5 scored 12 of these pages higher than v3 and 4 lower. Two of the four are
heuristic-only pages that v5 deliberately caps at "Suspicious".

**Attack pages Pagida had never seen** (`tools/harness/attack-pages`, served
over plain http, which gives v3 a head start):

| Page | v3.0.1 | v5.0.0 |
|---|---|---|
| Fake CAPTCHA that copies a PowerShell command (ClickFix) | Worth a look; command stays on the clipboard | Likely phishing; command replaced with a warning |
| Developer docs that copy `curl … \| bash` | Worth a look (http) | Worth a look (http); command left alone |
| Cloned Microsoft sign-in (two-step) | Likely phishing (only because of http) | Likely phishing: "copy of Microsoft's sign-in page" |
| Recovery-phrase form | Worth a look | Likely phishing |
| Fake virus warning with a phone number | Worth a look | Likely phishing |
| Fake Google pop-up window (browser-in-the-browser) | Suspicious | Likely phishing |
| Login form that posts to a Telegram bot | Likely phishing (only because of http) | Likely phishing: "goes to a Telegram bot" |
| Ordinary shop checkout with a card form | Worth a look (http) | Worth a look (http) |
| Copied CommBank NetBank log-on | Likely phishing | Likely phishing |

**URL tier alone** (`npm run evaluate`, same day's OpenPhish feed, 2,040
negatives): at "Worth a look" 96.2% precision and 68.3% recall (v1: 94.5% and
62.7%); at "Suspicious" 100% precision and 40.0% recall (v1: 97.8% and 30.3%);
0 false positives on the 40 hard-negative brand log-in URLs.

**What this does not show.** The phishing set is one morning of one feed. The
trained model in `src/core/model.ts` ships switched off: of 500 sampled
Phishing.Database links only one was still serving a live phishing page, and
`scripts/train-model.py` refuses to train on fewer than 300.

---

## v1 to v3: the URL tier

**Last reproduced: 16 September 2026, against that day's OpenPhish feed
(300 confirmed phishing URLs, 2,000 top-site negatives, 40 hand-built real
brand login URLs). Engine: v3.0.1.** Rerun it yourself with `npm run evaluate`;
the numbers move with the feed, and the ones below are one day's sample, not a
constant.

Pagida's detection engine is measured, not asserted. This document is the
methodology; `npm run evaluate` reproduces the numbers against live data, so
they move as the threat landscape does.

## What is being measured, and what is not

**The URL tier only**: 21 rules that work from the address alone, with no page
content and no network lookups.

> ### Read this before quoting any number below
>
> These figures describe **one of four layers**, and it is the weakest one by
> design. They are not Pagida's detection rate.
>
> In particular, the recall column collapses towards zero at the higher
> thresholds, and that is the expected result rather than a defect: an address
> on its own usually does not contain enough information to justify interrupting
> somebody. `evil-new-domain.com/login` looks like nothing, because it *is*
> nothing until you open it.
>
> What actually reaches the top band in real use is the **conclusions layer**
> (`src/core/conclusions.ts`), which correlates page content, domain age and
> threat intelligence, none of which this harness can see. A page that scores 8
> here will be called `danger` in the browser the moment the content script
> reports a brand sign-in form posting credentials to a third party.
>
> **The honest gap:** Pagida does not yet have an end-to-end measurement of the
> full engine, because that means rendering live phishing pages, and a
> harness that opens attacker-controlled pages is a liability rather than an
> asset. The conclusions layer is instead covered by unit tests over
> hand-specified evidence, which proves the logic and not the hit rate. Closing
> this gap properly (an isolated browser, an archived corpus, offline replay)
> is the top item on the roadmap, and until it is done nobody should claim a
> detection rate for Pagida as a whole.

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
lookalike rules: `telegraph.co.uk` sits two edits from `telegram`, and no
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

Long, path-heavy, and full of exactly the words a naive heuristic keys on:
*signin*, *login*, *secure*, *verify*, *scam*. These are where a URL-based
phishing detector normally falls apart, and they are the number worth quoting.

## Results

| Band | Threshold | Precision | Recall | F1 | False positives |
|---|---:|---:|---:|---:|---:|
| `WORTH_A_LOOK` | ≥15 | 94.6% | 58.7% | 72.4% | 10 / 2,040 |
| `SUSPICIOUS` | ≥30 | 96.4% | 18.0% | 30.3% | 2 / 2,040 |
| `LIKELY_PHISHING` | ≥55 | 100% | 0.3% | 0.7% | 0 / 2,040 |

**Hard negatives: 0 false positives out of 40.**

## How the bands were chosen

Not by picking round numbers, and not by maximising F1.

Maximum F1 in the sweep sits at threshold 5 (83.3%), and shipping there would be
a mistake: it flags 51 of 2,040 legitimate sites. A phishing warning that fires
on one site in forty is a warning people learn to click through, and a tool
people click through is worse than no tool at all.

So the bands are chosen by **what each one costs the user**:

- **≥15 shows a small badge.** A badge is cheap, so it can afford 58.7% recall
  at a 0.5% false-positive rate. This is where most real detection happens.
- **≥30 escalates the badge.** Over 96% precision: when this fires, it is
  almost always right.
- **≥55 interrupts the page with a warning bar.** Interrupting is expensive, so
  this band is set where the URL tier alone effectively cannot reach it. In
  practice the top band is triggered by page-content evidence or a blocklist
  match, not by address heuristics, which is exactly the intent.

## What these numbers do not mean

- **Recall is not detection rate.** 18% recall at the shipping threshold is
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
old, the registration is clean, the TLD is ordinary. The address is genuinely
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
allowlist        1982 domains (ranks 1-2000), disjoint from the negatives above

threshold sweep (all negatives)
  thr | precision | recall  |   F1    | FP | FN
  ----+-----------+---------+---------+----+----
    5 |     83.6% |   83.0% |   83.3% | 49 | 51
   10 |     83.4% |   78.7% |   81.0% | 47 | 64
   15 |     94.6% |   58.7% |   72.4% | 10 |124
   20 |     93.5% |   48.0% |   63.4% | 10 |156
   25 |     98.3% |   38.0% |   54.8% |  2 |186
   30*|     96.4% |   18.0% |   30.3% |  2 |246
   35 |    100.0% |   13.7% |   24.0% |  0 |259
   40 |    100.0% |    6.7% |   12.5% |  0 |280
   45 |    100.0% |    4.7% |    8.9% |  0 |286
   50 |    100.0% |    2.0% |    3.9% |  0 |294
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

score distribution: phishing
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

score distribution: legitimate
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
