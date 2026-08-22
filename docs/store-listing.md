# Chrome Web Store listing

Copy for the developer dashboard. Kept in the repo so the published listing and
the source stay in step.

---

## Name

`Pagida — Phishing Detector`

## Short description (132 characters max)

> Scores every page for phishing risk and shows you exactly which warning signs it found. Runs locally. No tracking.

*(115 characters)*

## Category

Productivity → Privacy & Security

## Detailed description

**Pagida tells you *why*, not just *what*.**

Most phishing warnings give you a colour and expect you to trust it. Pagida gives
you a risk score out of 100 and then shows you every single warning sign it
found, in plain English, with the actual evidence:

• "Login form sends your password to collector-node4.tk, not to this site" (+32)
• "Domain registered 3 days ago" (+30)
• "Says 'paypal' but the site owner is verify-account.tk" (+30)

You can check its reasoning yourself. You can disagree with it. And over time you
start spotting the same signs without needing the extension at all — which is the
point.

**HOW IT WORKS**

Pagida checks each page against 37 rules across three layers:

1. The address — lookalike characters, typosquats, brand names hiding in
   subdomains, free-registration TLDs, personalised phishing links, disposable
   hosting, and paths inside compromised WordPress installs.
2. The page — password boxes on unencrypted pages, login forms that submit
   somewhere else, brand impersonation, copied login pages, hidden frames,
   blocked paste, obfuscated scripts.
3. Reputation — the OpenPhish community blocklist and how old the domain is.

Only the highest risk band shows a warning bar, and it is always dismissible.

**YOUR CALL BEATS ITS CALL**

• Report a site as phishing and Pagida warns you about it from then on
• Mark a site as safe and it stops scoring it entirely
• Right-click any link → "Check this link with Pagida" scores it without opening it
• Everything you mark is listed, removable, and exportable as JSON

**PRIVACY**

Pagida has no account, no server, no analytics and no telemetry. It does not
request permission to read your browsing history.

Two optional lookups leave your machine, both switchable off in Options:

• The domain name only — never the full address — goes to rdap.org to check how
  old the domain is
• The OpenPhish public blocklist is downloaded once every 12 hours and matched
  on your own machine, so the pages you visit are never sent anywhere

Google Safe Browsing is available as a third option and is OFF by default,
because it is the only feature that would send full addresses to a third party.
If you want it, you supply your own API key.

**OPEN SOURCE**

Every line is on GitHub under the MIT licence, including a published evaluation
of how well the detection actually performs — measured against live phishing
feeds, with the false-positive rate stated openly.

Source: https://github.com/AryannDhingraa/pagida
Privacy policy: https://github.com/AryannDhingraa/pagida/blob/main/PRIVACY.md

**WHAT IT WILL NOT DO**

Pagida flags likely phishing. It does not and cannot catch everything —
particularly a compromised legitimate site that has not been reported yet. It is
a second opinion, not a guarantee. The known limitations are documented in the
repository rather than hidden.

## Permission justifications

Fill these into the dashboard exactly. Vague answers are the most common cause
of review delays.

| Permission | Justification to submit |
|---|---|
| `storage` | Stores the user's settings, the sites they have marked as safe or as phishing, a 7-day cache of domain-registration ages, and a local copy of the public phishing blocklist. All local; `chrome.storage.sync` is deliberately not used. |
| `contextMenus` | Adds two right-click items on links: "Check this link with Pagida", which scores a link without opening it, and "Report this link as phishing". |
| `alarms` | Refreshes the OpenPhish public blocklist once every 12 hours. |
| Host permission `https://rdap.org/*` | Looks up how recently a domain was registered, which is the strongest available signal for phishing. Only the registrable domain is sent — never the full URL. |
| Host permission `https://raw.githubusercontent.com/*` | Downloads the OpenPhish community blocklist file. No user data is sent. |
| Host permission `https://safebrowsing.googleapis.com/*` | Only used when the user explicitly enables Google Safe Browsing and supplies their own API key. Off by default. |
| Content script on `http://*/*` and `https://*/*` | A phishing detector must be able to inspect the page the user is on. The content script reads page structure only — whether a password field exists, where login forms submit, hidden frames, brand names in headings — and sends a fixed-shape summary to the extension's own service worker. It never reads page text, form values or credentials. |

## Data-use disclosures

- Does this extension collect user data? **No.**
- Personally identifiable information: **No**
- Health, financial, authentication, personal communications, location, web
  history, user activity: **No**
- Website content: **No.** The content script reads page structure locally and
  sends only a summary to the extension's own service worker, inside the
  browser. Nothing is transmitted off the device.
- Certify that you do not sell or transfer user data: **Yes**
- Certify that data is not used for purposes unrelated to the item's single
  purpose: **Yes**
- Certify that data is not used to determine creditworthiness or for lending:
  **Yes**

## Single purpose statement

> Pagida analyses the page the user is currently viewing and reports how likely
> it is to be a phishing page, along with the specific reasons for that
> assessment.

## Screenshots to upload (1280×800 or 640×400)

1. `docs/img/popup-danger.png` — the score and full signal breakdown on a
   phishing page. **Make this the first one.**
2. `docs/img/popup-clean.png` — a legitimate banking site coming back clean
3. `docs/img/link-danger.png` — the right-click link checker
4. `docs/img/options-danger.png` — the privacy controls
5. A screenshot of the in-page warning bar (record this yourself on a test page)

## Before you submit

- [ ] Never say Pagida "blocks" phishing — it *flags likely* phishing
- [ ] Privacy policy URL is set and publicly reachable
- [ ] Every permission has the justification above pasted in
- [ ] Screenshots are exactly 1280×800 or 640×400
- [ ] The store icon is 128×128 (`public/icons/icon128.png`)
