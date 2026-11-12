/**
 * Side-by-side test: loads two builds of Pagida into one headless Chromium,
 * visits each URL once, and records both verdicts for the same page at the same
 * moment. The Pagida service is switched off in both before anything is visited,
 * so a test run never spends the proxy's quota.
 */
const { chromium } = require('playwright');
const fs = require('fs');
// Usage: OLD=path/to/old/dist NEW=dist SITES=tools/harness/legit-sites.txt OUT=results.json node tools/harness/compare.cjs
// Add NOFEED=1 for phishing runs, so the blocklists cannot mark their own homework.
const [A, B] = [process.env.OLD, process.env.NEW || 'dist'].map((p) => require('path').resolve(p));
const SITES = process.env.SITES, OUT = process.env.OUT, CONC = Number(process.env.CONC || 6);
const sites = fs.readFileSync(SITES, 'utf8').split('\n').filter(Boolean);
(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(require('path').join(require('os').tmpdir(), 'pagida-')), {
    ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
    headless: false,
    args: ['--headless=new', `--disable-extensions-except=${A},${B}`, `--load-extension=${A},${B}`,
      ...(process.env.HTTPS_PROXY ? ['--proxy-server=' + process.env.HTTPS_PROXY] : []), '--proxy-bypass-list=127.0.0.1;localhost', '--lang=en-AU'],
    ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 }, locale: 'en-AU',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  });
  while (ctx.serviceWorkers().length < 2) await ctx.waitForEvent('serviceworker');
  // The build with the higher version number is "new". Load two different versions.
  const found = [];
  for (const sw of ctx.serviceWorkers()) {
    const v = await sw.evaluate(() => chrome.runtime.getManifest().version);
    found.push({ v: v.split('.').map(Number), id: new URL(sw.url()).host });
  }
  found.sort((a, b) => a.v[0] - b.v[0] || a.v[1] - b.v[1] || a.v[2] - b.v[2]);
  const ids = { old: found[0].id, new: found[1].id };
  console.error(ids);
  await new Promise(r => setTimeout(r, 3000));
  // Never call the Pagida Cloudflare proxy from tests.
  for (const sw of ctx.serviceWorkers()) await sw.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...(settings || {}), usePagidaService: false } });
  });
  for (const sw of ctx.serviceWorkers()) {
    const s = await sw.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
    if (!s || s.usePagidaService !== false) { console.error('proxy still on, aborting'); process.exit(2); }
  }
  console.error('pagida service off in both');
  if (process.env.NOFEED) {
    for (const sw of ctx.serviceWorkers()) await sw.evaluate(async () => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...(settings || {}), useFeeds: false, usePagidaService: false }, feedUrls: [], feedHosts: [] });
    });
  }
  await new Promise(r => setTimeout(r, process.env.NOFEED ? 5000 : 30000));
  const probes = {};
  for (const [k, id] of Object.entries(ids)) { probes[k] = await ctx.newPage(); await probes[k].goto(`chrome-extension://${id}/options.html`); }
  const results = []; const queue = [...sites];
  async function worker() {
    while (queue.length) {
      const url = queue.shift();
      const page = await ctx.newPage();
      let err = null;
      try { await page.goto(url, { waitUntil: 'load', timeout: 25000 }); } catch (e) { err = String(e.message).slice(0, 80); }
      await page.waitForTimeout(9000);
      const finalUrl = page.url();
      const meta = await page.evaluate(() => ({ title: document.title, pw: !!document.querySelector('input[type=password]'), len: document.body ? document.body.innerText.length : 0 })).catch(() => ({}));
      const row = { url, finalUrl, err, ...meta };
      // SAVE_TEXT=file.jsonl keeps each page's title and visible text, the same
      // text the page model scores, for testing or training the model later.
      if (process.env.SAVE_TEXT) {
        const text = await page.evaluate(() => `${document.title}\n${(document.body?.innerText ?? '').slice(0, 20000)}`).catch(() => '');
        if (text.length > 80) fs.appendFileSync(process.env.SAVE_TEXT, JSON.stringify({ url, finalUrl, pw: meta.pw, text }) + '\n');
      }
      for (const [k, p] of Object.entries(probes)) {
        const v = await p.evaluate(async (u) => {
          const tabs = await chrome.tabs.query({});
          const t = tabs.find(t => t.url === u);
          if (!t) return { error: 'no-tab' };
          return await chrome.runtime.sendMessage({ type: 'GET_VERDICT', tabId: t.id });
        }, finalUrl).catch(e => ({ error: String(e) }));
        const vd = v && v.verdict;
        row[k] = vd ? { band: vd.band, score: vd.score, conf: vd.confidence,
          concl: vd.conclusions.map(c => c.id + ': ' + c.title), sig: vd.signals.map(s => `${s.id}(${s.weight})`) } : { error: v && v.error };
      }
      results.push(row); fs.appendFileSync(OUT + 'l', JSON.stringify(row) + '\n');
      console.error(`${row.old?.band || '-'}\t${row.new?.band || '-'}\t${url}\t${(row.old?.concl||[]).join(' | ')}`);
      await page.close();
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
  await ctx.close();
})();
