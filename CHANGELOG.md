# Changelog

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
