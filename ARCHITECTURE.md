# Architecture

Pagida is a Chrome extension (Manifest V3) with two jobs: judging web pages,
and since v6, judging emails opened in Gmail and Outlook on the web. Both jobs
share one rule: **the engine is pure code with no browser APIs**, so the tests
and the evaluation scripts run the exact code the extension ships.

## Folders

```
src/
├── core/                 the web engine: pure TypeScript, no browser APIs
│   ├── rules/            url · dom · offline · reputation · compound
│   ├── util/             domain parsing, edit distance, homographs, entropy, networks
│   ├── data/             brands, login fingerprints, logo hashes, TLDs, allowlist, PSL
│   ├── evidence.ts       URL → PageEvidence
│   ├── score.ts          PageEvidence → Verdict (signals, conclusions, band)
│   ├── conclusions.ts    the one-sentence reasons that may raise a warning
│   └── wording.ts        band names, headlines, advice (small, for the page script)
├── email/                the email engine: pure, same discipline as core
│   ├── types.ts          EmailEvidence in, EmailVerdict out
│   ├── patterns.ts       word lists and patterns (free mail, trackers, lures)
│   ├── links.ts          unwrapping Gmail / Safe Links / Proofpoint redirects
│   └── evaluate.ts       EmailEvidence + link findings → EmailVerdict
├── learned/              the trained text models
│   ├── tokenize.ts       hashing tokenizer, identical to the Python trainer
│   ├── textModel.ts      logistic-regression scoring
│   └── data/             generated weights (emailModel.ts, pageModel.ts)
├── content/
│   ├── page/             every web page: reads the page, ClickFix guard, Iris on the page
│   └── mail/             Gmail and Outlook only: adapters, banner, link guard
├── background/           service worker: orchestration, lookups, icon, menus
├── services/             blocklists, feeds, RDAP, Pagida service, QR decoding, reports
├── ui/                   Iris and shared UI pieces
├── popup/ options/ report/
└── manifest.json

scripts/
├── build.mjs                 esbuild bundles into dist/ (OUTDIR to override)
├── evaluate.ts               URL-tier evaluation on today's phishing feed
├── evaluate-email.ts         email-engine evaluation on labelled email sets
├── email-corpus.py           mbox / maildir → the JSONL the email evaluator reads
└── train-text-models.py      trains and exports the two text models

tools/harness/                real-browser tests (see its README)
```

## How a web page is checked

1. `content/page` reads the page once it settles (and again on big changes):
   login forms and where they submit, what the page asks for, brand names
   where the page names itself, the favicon, the page text model's score.
2. It sends that summary to the worker as `PAGE_SIGNALS`.
3. The worker scores locally first: URL rules, page rules, the local
   blocklists, logo matching, domain age.
4. Only if that cannot already name an attack, and the site is not a top site
   or a brand's own domain, does it ask the Pagida service (Google Web Risk),
   at most once a day per site.
5. The verdict drives the toolbar icon, the popup and, when there is a named
   reason, Iris stepping onto the page.

## How an email is checked

1. `content/mail/adapters.ts` finds each open message on screen and reads the
   same facts in both clients: sender name and address, the reader's own
   address, subject, body text, links (unwrapped), attachment names and images
   the webmail has already loaded.
2. The email text model scores the subject and body **in the tab**. The words
   of the email never leave it.
3. `EMAIL_SIGNALS` goes to the worker with the facts and the model's one
   number. The worker decodes QR codes from the images, checks every link with
   the web engine and the local blocklists, and runs `email/evaluate.ts`.
4. If the email is not already called an attack, the worker goes online for
   what can still change the answer: the age of the sender's and links'
   domains (RDAP), and Google's threat lists for unknown link hostnames. Only
   domain names are sent.
5. The content script shows a card above the message when there is a named
   reason, and makes every risky link ask before it opens.

## The rules that keep false alarms down

- **Signals add up; only conclusions warn.** A score from small observations
  stops at "Worth a look". A warning the person sees needs a reason Pagida can
  say in one sentence.
- **The models nudge, they do not decide.** Both text models add or remove a
  few points. The email model only reaches a warning together with the shape
  of a phishing email: an unknown sender, wording it is sure about, and a link
  or attachment that leaves for somewhere unknown.
- **Known sites are never looked up, and never judged by guesswork.** The
  Tranco top 10,000 and every brand's own domains skip the network and cap
  the heuristics.
- **Every attack test has a twin.** Each detection test in `test/` sits next
  to the legitimate page or email it could be confused with.

## Data and training

`scripts/train-text-models.py --data <folder>` expects:

| Path | Source | Licence |
|---|---|---|
| `mail/phishing-2019` … `phishing-2025` | Nazario phishing corpus | CC BY 4.0 |
| `mail/easy_ham`, `easy_ham_2`, `hard_ham` | SpamAssassin public corpus | published for filter testing, see its readme |
| `hf/texts.json`, `hf/webs.json` | ealvaradob/phishing-dataset (Hugging Face) | Apache-2.0 |

The newest Nazario year (2025) is never trained on, and one SpamAssassin file
in five (chosen by file name hash) is held out, so `evaluate-email.ts` measures
the email engine on mail the model has not seen. A model below 0.95 AUC on
held-out data is not written.
