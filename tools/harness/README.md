# Real-browser test harness

The release gate for Pagida. Nothing ships if it makes this worse.

`compare.cjs` loads two builds of the extension into one headless Chromium,
visits each URL once and records both verdicts for the same page at the same
moment. It switches the Pagida service off in both builds before the first
visit and aborts if it cannot, so a test run never spends the proxy's quota.

```bash
npm install --no-save playwright && npx playwright install chromium
# Any Chromium already on disk works too: CHROME=/path/to/chrome node tools/harness/...
npm run build                                   # the new build, in dist/

# False alarms: real sites, blocklists on (as users have them)
OLD=../pagida-v3/dist NEW=dist SITES=tools/harness/legit-sites.txt OUT=legit.json node tools/harness/compare.cjs

# Detection: today's OpenPhish feed, one URL per host, blocklists OFF so they
# cannot mark their own homework
curl -s https://raw.githubusercontent.com/openphish/public_feed/main/feed.txt > phish.txt
NOFEED=1 OLD=../pagida-v3/dist NEW=dist SITES=phish.txt OUT=phish.json node tools/harness/compare.cjs
```

Each finished page is appended to `<OUT>l` (JSON lines) as it completes.

Add `SAVE_TEXT=pages.jsonl` to also keep each page's title and visible text
(the text the page model scores), for testing the model on today's pages.

`timing.cjs` measures how long each verdict takes to arrive on a first visit:
`EXT=dist SITES=list.txt OUT=timing.json node tools/harness/timing.cjs`.

`try-it.cjs` (`npm run try`) is for trying Pagida by hand. It opens a separate
test browser with the built extension and the Pagida service off, serves the
attack pages and the mock webmail itself, and opens a start page that lists
every test page with what Pagida should say about it.

`store-shots.cjs` makes the six store screenshots from the real build, at
1280 x 800: a headline, a plain browser window and Pagida's real popup, cards
and report. The fake pages it needs are in `store-pages/` (a copied sign-in, a
webmail screen, a fake "verify you are human" page), served over HTTPS at
believable addresses by `store-pages/serve.py`. It also visits commbank.com.au
and wikipedia.org for real. The Pagida service is switched off first, like
every script here. `ONLY=04` remakes one shot.

`store-tiles.cjs` draws the promo tiles, the Edge logo and a brand board with
Iris's own code (`src/ui/iris.ts`), so she matches the extension exactly.

```bash
npm run build && node tools/harness/store-shots.cjs && node tools/harness/store-tiles.cjs
```

`attack-pages/` holds one page per attack type v5 detects (ClickFix, copied
sign-in pages, recovery-phrase theft, fake virus warning, fake pop-up window,
Telegram exfiltration) plus two honest look-alikes (a developer install page and
a shop checkout). Serve them and run `attack-pages.cjs`:

```bash
(cd tools/harness/attack-pages && python3 -m http.server 8098) &
EXT=dist node tools/harness/attack-pages.cjs
```

Pass criteria for a release:
- no known-good site at "Suspicious" or above that was not there before, and
  never "Likely phishing";
- no drop in live phishing flagged at "Suspicious" or above;
- every attack page at "Likely phishing", both honest look-alikes below "Suspicious".

## Email (`mail-e2e.cjs`)

`mail-pages/` holds mock Gmail and Outlook messages: a CommBank phish from a
Gmail address with a disguised link, an HTML attachment and a QR code; a fake
Microsoft 365 password notice; a "your mailbox is full" notice that uses the
reader's organisation name and links to IPFS; and a real CommBank statement
email and a real Microsoft renewal email that must stay quiet.

They are served over HTTPS on 127.0.0.1:443, and Chromium is told that
`mail.google.com` and `outlook.office.com` live there, so the mail script runs
exactly as it does on the real sites. The Pagida service is forced off.

```bash
cd tools/harness/mail-pages
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 30 -subj /CN=pagida-test
sudo python3 serve.py 443 &
cd ../../.. && EXT=dist node tools/harness/mail-e2e.cjs
```

Pass: a "Likely phishing" card on each attack with its link held behind a
confirm, nothing on the two real emails, and the QR code read in the worker.
