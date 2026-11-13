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
- Every email gets a quiet "Checked by Pagida" line when nothing is wrong, so
  you can tell it is working.
- Gmail and Outlook tabs that were already open when Pagida was installed or
  updated are checked straight away, without a reload.
- On a Gmail or Outlook tab the popup shows how many emails were checked there
  and the last warning.
- Switch it off in Options: *Check my emails*.

### Copies of the sites you use
- **"This looks like your bank, but it is a different site."** When you sign
  in on a page Pagida already checked, it remembers that site's name and the
  look of its tab icon, on this computer only. A different site wearing the
  same icon and asking for a password is called out by name. This covers the
  banks, councils and work sign-in pages no brand list knows. Off switch and
  a wipe button in Options: *Remember where I sign in*.
- **Scam notes sent through real services.** A PayPal, DocuSign, QuickBooks,
  Xero or Square message that names a charge and says to phone a number if it
  was not you is flagged, even though the service really sent it.
- **When Pagida cannot read your mailbox, it says so.** If Gmail or Outlook
  change their layout and an open email cannot be read, the popup says
  "I cannot read the email that is open" instead of staying quiet.

### Knows the context
- **A private memory of the sites you use.** A site you have used on several
  days over weeks, with no warning ever, stops being judged by guesswork. Each
  Google Doc, Form, Drive file or free-hosted site is remembered on its own,
  so your team's Doc says nothing about a stranger's. Stored on this computer
  under a keyed hash with a key the browser keeps locked; forgotten after six
  months. Options: *Get to know the sites I use*.
- **Knows when you came from an email.** A page opened from an email Pagida
  warned about inherits that warning, even a page that looks clean on its own.
- **Passwords in online forms.** A Google Form or Microsoft Form asking for
  your email and password is called out.
- **Official sites.** Addresses only governments and universities can
  register (gov.au, gov.uk, gov.in, go.jp, edu and others) are never judged by
  guesswork, so new official sites and other countries' portals stop raising
  false alarms. Scam lists still apply.
- **Can this address be faked?** For emails claiming to come from your own
  organisation or a known brand, Pagida checks whether that domain blocks
  forged mail (DMARC). Brand answers are built in.
- **Company settings.** IT can set and lock Pagida's settings and list the
  organisation's own domains through Chrome policy.
- **Sign-in pages on free website hosts** are named for what they are.

### Faster
- Pages are read as soon as their content is there, not after every image and
  advert has loaded, and a page that is clearly an attack is answered without
  waiting for the domain-age lookup. On a first visit the median time to a
  verdict went from about 1 second to about 0.15 seconds, and copied sign-in
  pages are flagged in 0.14 seconds instead of 4.2, with no verdict changed.

### Security
- The ClickFix guard now covers frames. A page could copy its command
  through a hidden frame it made on the spot and get past the guard.
- A page can no longer erase the command Pagida saw it copy.
- Content scripts can only speak for the page they run in, and only the
  webmail sites can send email results.
- QR images in an email are never fetched from your home or office network.
- The Pagida service caps each network at 150 lookups a day, so one person
  cannot spend everyone's allowance. Its request logs are off.

### Popup and report
- "Nothing found" no longer sits above "Worth a look rather than an alarm".
- The site facts no longer stay on "checking…": the connection shows at once,
  and anything without an answer after 8 seconds says so.
- "One thing worth knowing" when there is one thing, not "a couple".
- The score ring on the report fits its label, and the report no longer claims
  that no model is involved.

### Trained models
- **Email model**: trained on the Nazario phishing corpus (2019 to 2024),
  ealvaradob/phishing-dataset and the SpamAssassin public corpus. Tested on
  Nazario 2025 and held-out SpamAssassin mail it never saw: AUC 0.993, 94.9%
  of phishing caught, 1.77% of normal mail scored as phishing. It runs in the
  tab and only counts together with the shape of a phishing email.
- **Page model**: trained on the same Hugging Face dataset's web pages (AUC
  0.979, 92.4% caught, 6.75% false positives). Used only on unknown sites
  that ask for a password, card or code.
- Both models now keep their 12,000 strongest weights instead of 6,000. On
  the same held-out data that caught more and flagged less on both: emails
  94.0% to 94.9% caught with false positives down from 1.98% to 1.77%, pages
  91.2% to 92.4% caught with false positives down from 6.90% to 6.75%. The
  whole email engine now warns on 75.7% of 2025 phishing (was 75.5%) with the
  same single false warning in 844 held-out normal emails.

### Fixes
- A link or page address with a stray `%` no longer stops the whole check.
- The page script is smaller (269 KB, down from 365 KB in v5): the wording
  moved out of the scoring module, so the page no longer bundles the allowlist.

## 5.0.0, November 2026: the offline engine

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
