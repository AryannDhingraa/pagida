# Privacy Policy

**Pagida — Phishing Detector**
Last updated: 21 August 2026

## The short version

Pagida does not collect anything. There is no account, no server, no analytics
and no telemetry. Two optional lookups leave your machine, both are listed
below, both can be switched off, and neither of them sends a page you visited.

## What Pagida stores, and where

Everything is stored in `chrome.storage.local` — on this computer, in this
browser profile, and nowhere else.

| Stored | What it is |
|---|---|
| Settings | Your toggles, sensitivity, and (if you added one) your Safe Browsing API key |
| Marked sites | Hostnames you explicitly reported as phishing or marked as safe |
| Domain-age cache | Registrable domains and their registration age, kept for 7 days |
| Blocklist | A copy of the OpenPhish public feed, refreshed every 12 hours |
| Counters | Three numbers: pages checked, warnings raised, sites you reported |

Pagida deliberately does **not** use `chrome.storage.sync`. Sync would push
browsing-derived data through your Google account, and a tool built to protect
your browsing should not quietly move it somewhere else.

Uninstalling the extension deletes all of it.

## What leaves your computer

### 1. Domain-age lookups — `rdap.org` (on by default)

Pagida sends **the registrable domain only** — `example.com` — to `rdap.org` to
find out when it was registered. Newly created domains are the single strongest
free signal in phishing detection.

- The path, query string, fragment and subdomains are **never** sent.
- Results are cached locally for seven days, so a domain is looked up at most
  once a week.
- Requests time out after four seconds and failure is silent.
- Switch it off: Options → Lookups → *Check how old a domain is*.

### 2. Blocklist download — `raw.githubusercontent.com` (on by default)

Pagida downloads the [OpenPhish community feed](https://github.com/openphish/public_feed)
once every 12 hours. This is a plain file download of a public list. The
matching then happens entirely on your machine — **the pages you visit are never
sent anywhere**.

Switch it off: Options → Lookups → *Use the OpenPhish community blocklist*.

### 3. Google Safe Browsing — **off by default**

This is the only feature that would send the full address of pages you open to a
third party, so it is off until you turn it on, and it requires you to supply
your own Google API key. If you enable it, the complete URL of each page you
visit is sent to Google, subject to
[Google's privacy policy](https://policies.google.com/privacy).

Switch it on: Options → Lookups → *Also check Google Safe Browsing*.

### 4. The site report — only when you open one

Opening a site report makes three further lookups, and only then:

- **`cloudflare-dns.com`** receives the domain name to look up its addresses and
  mail records.
- **`internetdb.shodan.io`** receives the IP address the domain resolves to, and
  returns what Shodan already knows about that machine from its own scanning.
  Pagida never scans anything itself.
- **`crt.sh`** receives the domain name and returns its public certificate
  history.

None of these receives the page you were on. All three run only when you press
the button, never in the background, and the whole feature can be switched off:
Options → What I look up → *Full site reports*.

### 5. PhishTank — only when you click

If you report a site as phishing, Pagida asks whether you also want to submit it
to PhishTank. Saying yes opens PhishTank in a new tab with the URL filled in.
Nothing is submitted automatically, and saying no keeps the report local.

## What the content script reads

Pagida runs a content script on `http` and `https` pages. It reads the page
structure and sends a **fixed-shape summary** to the extension's own service
worker — inside your browser, never over the network.

The summary contains only: whether a password field exists, where login forms
submit to, how many hidden frames there are, which brand names appear in the
title or headings, whether the favicon is external, whether paste or right-click
is blocked, a single obfuscation score, and link counts.

It does **not** contain page text, form values, passwords, cookies, session
tokens, or anything you type.

## What Pagida never does

- No analytics, crash reporting, or usage statistics
- No advertising, and no data sold or shared with anyone
- No user accounts and no identifiers of any kind
- No browsing history access — the extension does not request the `tabs`
  permission and cannot read your tab list or history
- No remote code: everything that runs is in the package you installed, and the
  content security policy blocks remote scripts

## Children

Pagida is not directed at children and collects nothing from anyone, including
children under 13.

## Changes

Material changes to this policy will be recorded in the repository's commit
history and noted in the release notes for the version they ship in.

## Contact

Open an issue at <https://github.com/AryanDhingraa/pagida/issues>, or see
[SECURITY.md](SECURITY.md) for security-specific reports.
