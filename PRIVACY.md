# Privacy Policy

**Pagida — Phishing Detector**
Last updated: 23 August 2026 (version 2.1.1)

## The short version

Pagida has no account, no analytics, no telemetry, no advertising, and sells
nothing. Scoring happens on your computer.

There is now **one** server involved, and this policy will not bury it: Pagida
runs a small proxy so that everyone gets the key-gated threat list for free
without registering for anything. It receives **a domain name** — `example.com`
— and never the address of the page you are on. It stores nothing. It is a
single switch on the options page, and turning it off costs you one signal out
of twenty-two, not the product.

Everything below is the long version, source by source.

## What Pagida stores, and where

Everything is stored in `chrome.storage.local` — on this computer, in this
browser profile, and nowhere else.

| Stored | What it is |
|---|---|
| Settings | Your toggles, sensitivity, and (if you added one) your own Safe Browsing API key |
| Marked sites | Hostnames you explicitly reported as phishing or marked as safe |
| Install id | A random string this browser generates for itself, used only as a quota counter for the service below. Not an account, not linked to you, never sent anywhere else |
| Domain-age cache | Registrable domains and their registration age, kept for 7 days |
| Blocklist | A copy of the public OpenPhish feed, refreshed every 12 hours |
| Counters | Three numbers: pages checked, warnings raised, sites you reported |

Pagida deliberately does **not** use `chrome.storage.sync`. Sync would push
browsing-derived data through your Google account, and a tool built to protect
your browsing should not quietly move it somewhere else.

Uninstalling the extension deletes all of it.

## What leaves your computer

### 1. The Pagida service — domain only (on by default)

Google publishes a list of sites caught spreading scams and malware. Reading it
requires a paid API key, which is exactly the kind of obstacle that means a
feature never reaches the people who need it most. So Pagida holds the key on a
Cloudflare Worker and asks on your behalf.

What is sent: **the bare domain name and nothing else.** The server rejects any
request containing a path or a query string, so a bug in the extension cannot
leak a URL here even by accident.

What is stored on the server: **nothing.** No IP address, no install id, no
query history, no logs, no analytics. The install id travels in a header purely
so a single runaway client cannot exhaust the shared daily allowance; it is
discarded once the counter is incremented, and the counter itself expires daily.

The proxy source is in the repository at `proxy/worker.js` — you can read
exactly what it does.

Why it is on by default: a protection nobody finds in a settings screen protects
nobody. That is a judgement call, made in the open, and reversible in one click:
Options → What I look up → *Check against Google's threat list*.

### 2. Domain-age lookups — `rdap.org` and the domain registries (on by default)

Pagida sends **the registrable domain only** — `example.com` — to find out when
it was registered. Newly created domains are the single strongest free signal in
phishing detection. `rdap.org` redirects to the registry that actually holds the
record, so the request may end at Verisign, Nominet, or another registry.

- The path, query string, fragment and subdomains are **never** sent.
- Results are cached locally for seven days.
- Requests time out after four seconds and failure is silent.
- Switch it off: Options → What I look up → *Check how old a domain is*.

### 3. Blocklist download — `raw.githubusercontent.com` (on by default)

Pagida downloads the [OpenPhish community feed](https://github.com/openphish/public_feed)
every 12 hours. This is a plain file download of a public list. The matching
then happens entirely on your machine — **the pages you visit are never sent**.

Switch it off: Options → What I look up → *The community scam list*.

### 4. The site report — only when you open one

Opening a site report makes further lookups, and only then. Every one of them
receives a domain name or an IP address. None receives the page you were on.

| Source | Receives | Returns |
|---|---|---|
| `cloudflare-dns.com` | the hostname and domain | addresses, mail and name records |
| `crt.sh` | the domain | its public certificate history |
| `internetdb.shodan.io` | the IP address the domain resolves to | what Shodan already knows about that machine from its own scanning. Pagida never scans anything itself |
| `ipwho.is` | the IP address | which network and country the address belongs to |
| `archive.org` | the domain | when the site was first archived |
| `urlhaus-api.abuse.ch` | the hostname | whether it is recorded as distributing malware |

All of these run only when you press the button, never in the background, and
the whole feature can be switched off: Options → What I look up → *Full site
reports*.

### 5. Your own Safe Browsing key — off by default

This is the only feature that sends the **full address** of pages you open to a
third party, which is why it is off, and why it requires you to supply your own
Google API key rather than using Pagida's. It exists for people who want the
check done page-by-page rather than domain-by-domain. If you enable it, the
complete URL of each page you visit is sent to Google, subject to
[Google's privacy policy](https://policies.google.com/privacy).

Switch it on: Options → What I look up → *Use my own Safe Browsing key*.

### 6. PhishTank — only when you click

If you report a site as phishing, Pagida asks whether you also want to submit it
to PhishTank. Saying yes opens PhishTank in a new tab with the URL filled in.
Nothing is submitted automatically, and saying no keeps the report local.

## What the content script reads

Pagida runs a content script on `http` and `https` pages. It reads the page
structure and sends a **fixed-shape summary** to the extension's own service
worker — inside your browser, never over the network.

The summary contains only: whether a password field exists, where login forms
submit to, how many hidden frames there are, which brand names appear in the
title or headings, where the tab icon is loaded from, whether paste or
right-click is blocked, a single obfuscation score, link and form counts, and —
for the report — the page's declared generator, framework hints, and the list of
third-party hosts it loads scripts from.

It does **not** contain page text, form values, passwords, cookies, session
tokens, or anything you type.

## Why Pagida asks for access to all sites

The extension requests `http://*/*` and `https://*/*`. A phishing detector that
only ran on a list of sites would be useless, because the whole point is the
site you have never seen before. The permission is used to read page structure
as described above and to reach the lookup services listed above. It is not used
to read your history, your tab list, or the contents of pages.

## What Pagida never does

- No analytics, crash reporting, or usage statistics
- No advertising, and no data sold, rented or shared with anyone
- No user accounts, no sign-in, no email address, no identifiers tied to you
- No selling or transferring data to third parties for any purpose
- No creditworthiness, lending, or other unrelated use of any data
- No remote code: everything that runs is in the package you installed, and the
  content security policy blocks remote scripts

## Children

Pagida is not directed at children and collects nothing from anyone, including
children under 13.

## Changes

Material changes to this policy will be recorded in the repository's commit
history and noted in the release notes for the version they ship in.

## Contact

Open an issue at <https://github.com/AryannDhingraa/pagida/issues>, or see
[SECURITY.md](SECURITY.md) for security-specific reports.
