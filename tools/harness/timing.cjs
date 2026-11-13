/**
 * How fast does a verdict arrive? Loads each URL in a fresh profile (so
 * nothing is cached, like a first visit) and measures, from the moment the
 * page's HTML has loaded, how long until the worker has a verdict for it.
 * The Pagida service is switched off first and the run stops if it is not.
 *
 *   EXT=dist SITES=list.txt OUT=timing.json node tools/harness/timing.cjs
 *   CHROME=/path/to/chrome   optional, any Chromium already on disk
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const EXT = path.resolve(process.env.EXT || 'dist');
const sites = fs.readFileSync(process.env.SITES, 'utf8').split('\n').filter(Boolean);
const OUT = process.env.OUT || 'timing.json';

(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(require('os').tmpdir(), 'pagida-t-')), {
    ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
    headless: false,
    args: ['--headless=new', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
      '--host-resolver-rules=MAP *.pagidatest.com 127.0.0.1', '--proxy-bypass-list=*.pagidatest.com;127.0.0.1'],
    viewport: { width: 1280, height: 900 },
  });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = new URL(sw.url()).host;
  await new Promise((r) => setTimeout(r, 2000));
  await sw.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...(settings || {}), usePagidaService: false } });
  });
  const s = await sw.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
  if (!s || s.usePagidaService !== false) { console.error('proxy still on, aborting'); process.exit(2); }
  console.error('pagida service off');
  const probe = await ctx.newPage(); await probe.goto(`chrome-extension://${id}/options.html`);
  const rows = [];
  for (const url of sites) {
    const p = await ctx.newPage();
    let t0 = 0;
    p.once('domcontentloaded', () => { t0 = Date.now(); });
    try { await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 }); } catch { /* measured below anyway */ }
    if (!t0) t0 = Date.now();
    let ms = null; let band = null;
    while (Date.now() - t0 < 15000) {
      // The current address each time: many sites redirect after loading.
      const v = await probe.evaluate(async (u) => {
        const t = (await chrome.tabs.query({})).find((x) => x.url === u);
        return t ? chrome.runtime.sendMessage({ type: 'GET_VERDICT', tabId: t.id }) : null;
      }, p.url()).catch(() => null);
      if (v && v.verdict) { ms = Date.now() - t0; band = v.verdict.band; break; }
      await new Promise((r) => setTimeout(r, 25));
    }
    rows.push({ url, ms, band });
    console.error(`${String(ms ?? 'none').padStart(6)} ms  ${band ?? '-'}  ${url}`);
    await p.close();
  }
  const done = rows.filter((r) => r.ms !== null).map((r) => r.ms).sort((a, b) => a - b);
  const q = (f) => done[Math.min(done.length - 1, Math.floor(done.length * f))];
  const summary = { pages: rows.length, answered: done.length, median: q(0.5), p90: q(0.9), max: done[done.length - 1] };
  console.error(summary);
  fs.writeFileSync(OUT, JSON.stringify({ summary, rows }, null, 1));
  await ctx.close();
})();
