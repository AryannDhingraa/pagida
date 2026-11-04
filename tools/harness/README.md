# Real-browser test harness

The release gate for Pagida. Nothing ships if it makes this worse.

`compare.cjs` loads two builds of the extension into one headless Chromium,
visits each URL once and records both verdicts for the same page at the same
moment. It switches the Pagida service off in both builds before the first
visit and aborts if it cannot, so a test run never spends the proxy's quota.

```bash
npm install --no-save playwright && npx playwright install chromium
npm run build                                   # the new build, in dist/

# False alarms: real sites, blocklists on (as users have them)
OLD=../pagida-v3/dist NEW=dist SITES=tools/harness/legit-sites.txt OUT=legit.json node tools/harness/compare.cjs

# Detection: today's OpenPhish feed, one URL per host, blocklists OFF so they
# cannot mark their own homework
curl -s https://raw.githubusercontent.com/openphish/public_feed/main/feed.txt > phish.txt
NOFEED=1 OLD=../pagida-v3/dist NEW=dist SITES=phish.txt OUT=phish.json node tools/harness/compare.cjs
```

Each finished page is appended to `<OUT>l` (JSON lines) as it completes.

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
