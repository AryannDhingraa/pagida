// Serves tools/harness/attack-pages on :8098 first:  (cd tools/harness/attack-pages && python3 -m http.server 8098)
// then: EXT=dist node tools/harness/attack-pages.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const EXT = require('path').resolve(process.env.EXT || 'dist');
const pages = ['clickfix', 'devdocs', 'mslogin', 'seed', 'tech', 'bitb', 'telegram', 'shop', 'cbank', 'framecopy'];
(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(require('path').join(require('os').tmpdir(), 'pagida-')), {
    ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
    headless: false,
    args: ['--headless=new', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
      '--host-resolver-rules=MAP *.pagidatest.com 127.0.0.1', ...(process.env.HTTPS_PROXY ? ['--proxy-server=' + process.env.HTTPS_PROXY] : []), '--proxy-bypass-list=*.pagidatest.com;127.0.0.1', '--unsafely-treat-insecure-origin-as-secure=' + pages.map(n => `http://${n}-site.pagidatest.com:8098`).join(',')],
    viewport: { width: 1280, height: 900 },
  });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = new URL(sw.url()).host;
  await new Promise(r => setTimeout(r, 2000));
  await sw.evaluate(async () => { const { settings } = await chrome.storage.local.get('settings'); await chrome.storage.local.set({ settings: { ...(settings || {}), usePagidaService: false } }); });
  const probe = await ctx.newPage(); await probe.goto(`chrome-extension://${id}/options.html`);
  for (const name of pages) {
    const url = `http://${name}-site.pagidatest.com:8098/${name}.html`;
    const p = await ctx.newPage();
    try { await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://${name}-site.pagidatest.com:8098` }); } catch (e) {}
    await p.goto(url); await p.waitForTimeout(2500);
    let clip = null;
    if (await p.$('#v')) { await p.click('#v'); await p.waitForTimeout(2500); clip = await p.evaluate(() => navigator.clipboard.readText()).catch(e => 'ERR ' + e.message); }
    const v = await probe.evaluate(async (u) => { const t = (await chrome.tabs.query({})).find(t => t.url === u); return t ? chrome.runtime.sendMessage({ type: 'GET_VERDICT', tabId: t.id }) : { error: 'no-tab' }; }, url);
    const vd = v.verdict || {};
    const companion = await p.evaluate(() => [...document.documentElement.children].some(e => e.tagName.toLowerCase().includes('pagida') || e.id.includes('pagida'))).catch(() => null);
    console.log(name.padEnd(9), (vd.band || v.error).padEnd(10), vd.score, '|', (vd.conclusions || []).map(c => c.id).join(','), '|', (vd.signals || []).filter(s => s.weight > 0).map(s => s.id + '(' + s.weight + ')').join(' '), clip !== null ? '\n          clipboard: ' + String(clip).slice(0, 90) : '');
    await p.close();
  }
  await ctx.close();
})();
