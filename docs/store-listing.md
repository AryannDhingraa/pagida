# Chrome Web Store listing — Pagida 2.1.1

Everything the developer dashboard asks for, written out so it can be pasted
field by field. Kept in the repo so the published listing and the source stay in
step.

> **Read the two warnings first.** They are at the bottom under *Things that get
> extensions rejected*. Getting the data disclosure wrong is the single most
> common reason a security extension is pulled after publication.

---

## 1. Store listing tab

### Name (45 characters max)

```
Pagida — Phishing Detector
```

*(26 characters. The em dash is fine; avoid keyword stuffing like "Pagida —
Phishing Detector, Scam Blocker, Safe Browsing" — it reads as spam and is
against the listing rules.)*

### Short description (132 characters max)

```
Scores every page for phishing risk and shows you exactly which warning signs it found — in plain English, on your machine.
```

*(122 characters.)*

### Category

**Privacy & Security**

### Language

English (Australia)

### Detailed description

```
Pagida tells you WHY, not just what.

Most phishing warnings give you a red screen and expect you to trust it. Pagida gives you a risk score out of 100, then shows you every single warning sign it found, in plain English, with the evidence attached:

  "The login form sends your password to collector-node4.tk, not to this site"  +32
  "This domain was registered 3 days ago"  +30
  "The page says 'PayPal' but the site owner is verify-account.tk"  +30

You can check the reasoning. You can disagree with it. And after a few weeks you start spotting the same signs yourself — which is the actual point.


MEET IRIS

Iris is the small face in the corner. She reads the page with you, stays quiet when everything is fine, and turns from calm blue to alarmed red when it is not. She is not decoration: her expression is the score, visible before you read a word.


WHAT PAGIDA CHECKS — 38 rules across four layers

  THE ADDRESS
  Lookalike characters, typosquats, brand names hiding in subdomains, free-registration TLDs, personalised phishing links with your email in them, disposable hosting, and paths inside compromised WordPress installs.

  THE PAGE
  Password boxes on unencrypted pages, login forms that submit somewhere else entirely, brand impersonation, copied login pages, hidden frames, blocked paste, obfuscated scripts, anti-analysis tricks.

  REPUTATION
  The OpenPhish community blocklist, the URLhaus malware database, how old the domain is, and Google's own list of sites caught spreading scams — free, with no sign-up (see PRIVACY below).

  PATTERNS
  Combinations that are individually weak and jointly damning.


THE FULL SITE REPORT

Press one button and Pagida tells you what a site actually is:

  Who registered the domain and when
  Where it is hosted, on whose network, in which country
  Its complete public certificate history
  Whether it can even send email (a scam domain usually cannot)
  What the site is built with, and whose code it loads
  Which ports are open on the machine behind it
  Whether the internet archive has ever seen it before

None of that requires an account or an API key. It is the depth a professional would go to, in one screen.


YOUR CALL BEATS ITS CALL

  Report a site as phishing and Pagida warns you about it from then on
  Mark a site as safe and it stops scoring it
  Right-click any link and check it WITHOUT opening it
  Everything you mark is listed, removable, and exportable as JSON


PRIVACY

No account. No sign-in. No analytics. No telemetry. No advertising. Nothing sold to anyone. The scoring runs on your computer.

Pagida runs one small server, and it is not going to be buried in the fine print: it holds the paid API key that Google's threat list requires, so that you get that protection for free without registering for anything. It receives a bare domain name — "example.com" — and never the address of the page you are on. It stores nothing at all: no IP, no history, no logs. It refuses any request containing a path. Its complete source is in the repository. One switch in Options turns it off, and the other twenty-one signals carry on without it.

Domain-age lookups send the domain only. The blocklist is downloaded as a plain file and matched on your own machine, so the pages you visit are never sent anywhere.

Full details, source by source: https://github.com/AryannDhingraa/pagida/blob/main/PRIVACY.md


OPEN SOURCE, AND HONEST ABOUT ITS LIMITS

Every line is on GitHub under the MIT licence, including a published evaluation of how well the detection actually performs — measured against live phishing feeds, with the false-positive rate stated openly rather than quietly omitted.

Pagida flags likely phishing. It cannot catch everything, particularly a legitimate site that was compromised an hour ago. It is a second opinion, not a guarantee, and the known limitations are documented in the repository instead of hidden.

Source:         https://github.com/AryannDhingraa/pagida
Privacy policy: https://github.com/AryannDhingraa/pagida/blob/main/PRIVACY.md
Report a bug:   https://github.com/AryannDhingraa/pagida/issues
```

### Screenshots — 1280×800 (preferred) or 640×400, at least one, up to five

Order matters; the first is the one most people ever see.

| # | Shot | Caption to burn into the image |
|---|---|---|
| 1 | The popup on a phishing page: red Iris, score, signal list | **It shows you exactly what it found** |
| 2 | The full site report, host tab | **Who owns it, where it lives, how old it is** |
| 3 | The popup on a real bank, clean and blue | **And it stays quiet when a site is fine** |
| 4 | Right-click → Check this link with Pagida | **Check a link without opening it** |
| 5 | Options page, privacy switches visible | **Every lookup is listed. Every one has a switch.** |

Captions: 40–48px bold, left-aligned in the top 140px, dark ink on the light
aurora background. Do not put text over the popup itself.

### Small promo tile — 440×280 (required if you want to be featured)

Iris's face on the light aurora wash, the word **Pagida** underneath, nothing
else. No screenshots inside a promo tile — Google rejects those.

### Marquee promo tile — 1400×560 (optional)

Iris on the left third, and on the right: *"Why is this site asking for my
password?"* with the answer underneath in the signal-list style.

---

## 2. Privacy practices tab — the part that matters

### Single purpose statement

```
Pagida analyses the page the user is currently viewing and reports how likely it is to be a phishing page, together with the specific evidence for that assessment.
```

### Permission justifications

Paste these exactly. Vague justifications are the most common cause of review
delays.

| Permission | Justification |
|---|---|
| `storage` | Stores the user's settings, the sites they have marked as safe or as phishing, a seven-day cache of domain registration ages, and a local copy of the public phishing blocklist. All of it is local; `chrome.storage.sync` is deliberately not used, so no browsing-derived data passes through the user's Google account. |
| `contextMenus` | Adds two right-click items on links: "Check this link with Pagida", which scores a link without opening it, and "Report this link as phishing". |
| `alarms` | Refreshes the public OpenPhish blocklist once every twelve hours. |
| `activeTab` | Lets the popup read the address of the tab the user has open at the moment they click the extension icon, so it can display the verdict for that page. It grants nothing until the user clicks. |
| **Host permission `http://*/*` and `https://*/*`** | A phishing detector is only useful on a site the user has never seen before, so it cannot operate from a fixed list of sites. This permission is used for two things and nothing else. First, the content script reads page structure on the page the user is viewing — whether a password field exists, where login forms submit to, hidden frames, brand names in headings, where the tab icon is loaded from — and passes a fixed-shape summary to the extension's own service worker inside the browser. It never reads page text, form values or credentials. Second, it allows the extension to reach the small number of reputation and domain-information services listed in the privacy policy. The extension does not request the `tabs` permission and cannot read the user's browsing history or tab list. |
| **Remote code** | **No.** Everything that executes is inside the uploaded package. The content security policy blocks remote scripts. The blocklist download is a plain text file of hostnames that is parsed as data, never evaluated. |

### Data collection disclosure — answer it like this

Chrome defines "collect" as *transmitting off the user's device*, whether or not
anything is stored. Pagida transmits a domain name, so the honest answers are:

| Question | Answer | Why |
|---|---|---|
| Personally identifiable information | **No** | No name, address, email, age or identifier is ever sent. |
| Health information | **No** | |
| Financial and payment information | **No** | |
| Authentication information | **No** | Passwords and tokens are never read, let alone sent. |
| Personal communications | **No** | |
| Location | **No** | |
| **Web history** | **Yes** | The domain name of the site being visited is sent to Pagida's own lookup service and to `rdap.org` in order to check it for known scam activity and registration age. The full URL is not sent. Nothing is stored, and the feature can be switched off. |
| **User activity** | **No** | No clicks, scrolls, keystrokes or mouse position are recorded or transmitted. |
| **Website content** | **No** | Page structure is summarised on the device and passed only to the extension's own service worker inside the browser. No page content is transmitted off the device. |

Then the three certifications, all **Yes**:

- I do not sell or transfer user data to third parties outside of approved use
  cases — **Yes**
- I do not use or transfer user data for purposes unrelated to my item's single
  purpose — **Yes**
- I do not use or transfer user data to determine creditworthiness or for
  lending purposes — **Yes**

**Privacy policy URL:**
`https://github.com/AryannDhingraa/pagida/blob/main/PRIVACY.md`

It must be publicly reachable without logging in. A GitHub blob URL is fine.
A GitHub Pages copy at `https://aryanndhingraa.github.io/pagida/privacy` looks
more professional if you want to spend twenty minutes on it.

---

## Things that get extensions rejected

**1. The "Web history: Yes" answer is not optional.** It is tempting to answer
No because nothing is stored. Google's definition of *collect* is about
transmission, not retention, and answering No while the extension sends domain
names is a false disclosure — which is a takedown, not a rejection. Answer Yes,
explain it in one sentence, and the review passes. The feature is allowed: it
is core to the item's single purpose, which is exactly the exemption the policy
provides for.

If you would rather answer No honestly, the way to earn it is to move to the
Web Risk **Update API**, which downloads hash prefixes and matches locally so
nothing about the visited site leaves the machine. That is a genuine piece of
work, not a settings change, and it is the right thing to do once the extension
has users.

**2. Never say Pagida "blocks" phishing.** It *flags likely* phishing. Overstated
security claims are a listing-policy violation, and the honest version is a
better pitch anyway.

**3. The broad host permission needs the justification above, verbatim.** A
one-line answer like "to scan pages" is the reason security extensions sit in
review for three weeks.

---

## Submission checklist

- [ ] `npm run zip` produced `pagida-v2.1.1.zip` and the manifest version inside
      matches what you type into the dashboard
- [ ] The Worker is deployed and `API_BASE` in `src/services/pagidaApi.ts` points
      at it — an extension shipped with a dead API base looks broken on install
- [ ] Privacy policy URL is set and opens in a private window
- [ ] Every permission has its justification pasted in
- [ ] Data disclosure answered as above, including **Web history: Yes**
- [ ] Screenshots are exactly 1280×800 or 640×400 — not 1279, not 801
- [ ] Store icon is 128×128 with no alpha padding
- [ ] Single purpose statement pasted
- [ ] Support email set to one you actually read
- [ ] Visibility: **Unlisted** for the first day, so you can install from the
      store yourself and check it before anyone else sees it
