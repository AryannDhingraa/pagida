# Changelog

## 6.0.0, November 2026: email

Pagida now checks the emails you open in Gmail and Outlook on the web, with
the same rule as for web pages: it only warns when it can say why in one
sentence.

### Email checking
- **Gmail and Outlook on the web** (outlook.live.com, outlook.office.com,
  outlook.office365.com). A card appears above a dangerous email, and every
  risky link in it asks before it opens. Nothing appears on ordinary mail.
- **Who sent it**: a brand name on the wrong address ("CommBank" from a Gmail
  account), lookalike sender domains, "via OneDrive" style names, and emails
  that use your own organisation's name ("monkey.org Helpdesk") from somewhere
  else.
- **Where the links go**: every link is unwrapped (Gmail, Safe Links,
  Proofpoint) and checked with the web engine and the local blocklists. Link
  text that shows one address and opens another. Links to IPFS, storage
  buckets and free site builders when the email wants you to sign in.
- **What is attached**: web-page and program attachments, Office macros.
- **QR codes**: decoded from images the webmail has already loaded, and
  checked like links. "Scan to verify" to an unknown site is called out.
- **What it asks for**: changed bank details, gift cards, "your mailbox is
  full", "your password expires today", and fake receipts that want you to
  phone a number about a charge (callback scams).
- **Online when it helps**: for an email not already called an attack, the
  age of the sender's and links' domains, and Google's threat lists for
  unknown link hostnames. Only domain names are sent; the email itself never
  leaves the computer.
- Switch it off in Options: *Check my emails*.

### Trained models
- **Email model**: trained on the Nazario phishing corpus (2019 to 2024),
  ealvaradob/phishing-dataset and the SpamAssassin public corpus. Tested on
  Nazario 2025 and held-out SpamAssassin mail it never saw: AUC 0.992. It
  runs in the tab and only counts together with the shape of a phishing email.
- **Page model**: trained on the same Hugging Face dataset's web pages (AUC
  0.976). Used only on unknown sites that ask for a password, card or code.

### Fixes
- A link or page address with a stray `%` no longer stops the whole check.
- The page script is smaller (269 KB, down from 365 KB in v5): the wording
  moved out of the scoring module, so the page no longer bundles the allowlist.

## 5.0.0 — November 2026: the offline engine

Pagida now catches phishing on its own, on your computer. The Google lookup
through the Pagida service is a backup, asked about far fewer sites.

### Stopped crying wolf (the v4 fixes, rolled in)
- Brand detection reads only where a page names itself (title, site name, main
  heading, logo, the heading over the login box), matches whole words, and
  ignores "Continue with Google", "Pay with PayPal", "Apple Pay" and "powered
  by" phrases. v3 called Figma, Atlassian, Trello, Stack Overflow, Twitch and
  15 more login pages "Likely phishing" because of their social sign-in buttons.
- A login box hidden in a closed pop-up no longer counts as the page asking for
  a password; two-step sign-ins (email first) still do.
- Allowlist rebuilt from the current Tranco top 10,000 (was a 2017-era top 2,000).
- Your own network (routers, `localhost`, `.local`, Tailscale, intranet names)
  is never scored and never looked up.
- JSON data blocks are no longer "obfuscated code"; analytics, captcha and
  payment frames are no longer "hidden frames"; opaque ids in old domains'
  URLs are no longer "random-looking codes".
- Heuristics alone stop at "Suspicious", and at "Worth a look" on domains over
  two years old. Iris only steps onto a page when she can name the reason.
- Host-level blocklist matches are ignored on shared hosts (s3 buckets,
  docs.google.com, github.com).

### New offline detection
- **Copied sign-in pages**: field-level fingerprints of the Microsoft, Google,
  Apple, PayPal, Meta, Amazon, Netflix, LinkedIn, Dropbox, Adobe, CommBank,
  ANZ, Westpac and Steam sign-in pages. Also catches reverse-proxy (AiTM) kits,
  which serve the real page on the wrong domain.
- **Logo matching**: favicon fingerprints of 35 brands, checked on unknown
  sites that ask for something.
- **Brand assets**: pages that load their look from a brand's own sign-in CDN.
- **What the page asks for**: cards, one-time codes and crypto recovery phrases,
  not just passwords. A recovery-phrase form off a wallet's own site is always
  "Likely phishing".
- **Where the data goes**: Telegram bots, Discord webhooks, free form relays.
- **ClickFix guard**: a fake CAPTCHA that copies a command and tells you to
  press Win+R gets its command replaced with a warning, so pasting runs nothing.
  Developer pages that copy install commands are left alone.
- **Lures without a login**: fake virus warnings with a phone number, "secure
  document" pages in a brand's name, crypto giveaways, fake pop-up windows
  showing a brand's address (browser-in-the-browser).
- **Bigger local blocklist**: Phishing.Database (~390,000 active domains),
  fingerprinted and searched on the machine, with brands, top sites and shared
  hosts filtered out first.
- **Brand list**: 100 → about 215 brands, with every real domain each one uses.

### Fewer lookups
- **Lookup memory**: a clean Google answer is remembered for 24 hours per
  domain (1 hour on shared hosts), in storage that survives the worker sleeping.
- Top-10,000 sites and brand domains are never sent to the Pagida service, and
  neither is any page the offline engine has already caught.

### Pagida service (proxy) 5.0
- No more Workers KV. A Durable Object holds an exact global daily budget of
  3,000 lookups (inside Web Risk's free 100,000 a month); per-IP and
  per-install limits use Cloudflare's rate-limiting binding. Fails closed.

### Not yet switched on
- A trained model (`src/core/model.ts`, `scripts/train-model.py`) is built in
  but ships empty. Of 500 sampled Phishing.Database links, only one was still
  serving a live phishing page, so there was not enough real data to train it
  honestly. The script refuses to train on fewer than 300 live pages.
