/**
 * Store screenshots from the real build. Each shot is a page as Pagida sees
 * it, with Pagida's own popup over it, laid out at 1280 x 800 with one line
 * of caption. The Pagida service is switched off first and the run stops if
 * it is not, so making screenshots never spends the proxy's quota.
 *
 * Needs the attack pages on :8098 and the mock webmail on :8443:
 *   (cd tools/harness/attack-pages && python3 -m http.server 8098) &
 *   (cd tools/harness/mail-pages && python3 serve.py 8443) &      # cert.pem/key.pem, see mail-e2e.cjs
 *   EXT=dist OUT=docs/store node tools/harness/store-shots.cjs
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const EXT = path.resolve(process.env.EXT || 'dist');
const OUT = path.resolve(process.env.OUT || 'docs/store');
const attack = (n) => `http://${n}-site.pagidatest.com:8098/${n}.html`;

const shots = [
  { file: '01-copied-bank.png', url: attack('cbank'), popup: true,
    title: 'Catches fake sign-in pages', sub: 'A copy of a bank\'s login page, on a domain the bank does not own. Pagida says so in one sentence.' },
  { file: '02-email.png', url: 'https://mail.google.com/gmail-phish.html', wait: 4000,
    title: 'Checks the emails you open', sub: 'In Gmail and Outlook on the web. The email is read on your computer and never sent anywhere.' },
  { file: '03-clickfix.png', url: attack('clickfix'), click: '#v',
    title: 'Stops fake "fix it" commands', sub: 'Pages that try to make you paste a command into your computer get stopped before you can.' },
  { file: '04-quiet.png', url: 'https://www.commbank.com.au/', popup: true,
    title: 'Quiet on the real thing', sub: 'The real CommBank gets nothing. A warning that cries wolf gets ignored, so Pagida does not.' },
  { file: '05-settings.png', ext: 'options.html',
    title: 'Plain words, your choice', sub: 'Every setting explained by Iris. No account, no tracking, works offline.' },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(require('os').tmpdir(), 'pagida-shots-')), {
    ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
    headless: false,
    args: ['--headless=new', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
      '--host-resolver-rules=MAP *.pagidatest.com 127.0.0.1, MAP mail.google.com 127.0.0.1:8443',
      '--ignore-certificate-errors', '--proxy-bypass-list=*.pagidatest.com;127.0.0.1', '--lang=en-AU',
      '--unsafely-treat-insecure-origin-as-secure=' + ['cbank', 'clickfix'].map((n) => `http://${n}-site.pagidatest.com:8098`).join(',')],
    viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: 'en-AU',
  });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = new URL(sw.url()).host;
  await new Promise((r) => setTimeout(r, 2000));
  await sw.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    // whatsNew off too, so the one-time "new" note does not sit in every shot.
    await chrome.storage.local.set({ settings: { ...(settings || {}), usePagidaService: false }, whatsNew: null });
  });
  const s = await sw.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
  if (!s || s.usePagidaService !== false) { console.error('proxy still on, aborting'); process.exit(2); }
  console.error('pagida service off');
  const probe = await ctx.newPage(); await probe.goto(`chrome-extension://${id}/options.html`);

  for (const shot of shots) {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: 1280, height: 800 });
    await p.goto(shot.url || `chrome-extension://${id}/${shot.ext}`, { waitUntil: 'load', timeout: 30000 }).catch(() => {});
    if (shot.click) {
      await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(shot.url).origin }).catch(() => {});
      await p.click(shot.click).catch(() => {});
    }
    await p.waitForTimeout(shot.wait || 3000);
    // The test pages are bare HTML; give them an ordinary font so they read as pages.
    if (/pagidatest|mail\.google/.test(shot.url || '')) await p.addStyleTag({ content: 'body{font-family:-apple-system,"Segoe UI",sans-serif;padding:20px 28px}' });
    // With the popup on top, Iris's card on the page would only peek out behind it.
    if (shot.popup) await p.evaluate(() => document.getElementById('pagida-companion-host')?.remove());
    const page = await p.screenshot({ type: 'png' });

    let popup = null;
    if (shot.popup) {
      const tabId = await probe.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)?.id, p.url());
      const pop = await ctx.newPage();
      // The popup asks for "the active tab"; point that at the page being shot.
      await pop.addInitScript((tid) => {
        const query = chrome.tabs.query.bind(chrome.tabs);
        chrome.tabs.query = async (q) => (q && q.active ? [await chrome.tabs.get(tid)] : query(q));
      }, tabId);
      await pop.setViewportSize({ width: 372, height: 600 });
      await pop.goto(`chrome-extension://${id}/popup.html`);
      await pop.addStyleTag({ content: '::-webkit-scrollbar{display:none}' }).catch(() => {});
      // Wait for the site facts (the full report asks seven public sources).
      await pop.waitForFunction(() => ![...document.querySelectorAll('#facts .loading, #facts *')].some((e) => /checking|No answer yet/.test(e.textContent || '') && e.children.length === 0), null, { timeout: 30000 }).catch(() => {});
      await pop.waitForTimeout(500);
      const h = await pop.evaluate(() => Math.ceil(document.body.getBoundingClientRect().height));
      await pop.setViewportSize({ width: 372, height: Math.min(h, 640) });
      popup = await pop.screenshot({ type: 'png' });
      await pop.close();
    }

    const frame = await ctx.newPage();
    await frame.setViewportSize({ width: 1280, height: 800 });
    const img = (b) => `data:image/png;base64,${b.toString('base64')}`;
    await frame.setContent(`<!doctype html><html><head><style>
      * { box-sizing: border-box; margin: 0; }
      body { width: 1280px; height: 800px; overflow: hidden; font-family: -apple-system, "Segoe UI", Inter, sans-serif;
        background: radial-gradient(1200px 500px at 10% 0%, #E9FBF8 0%, transparent 60%), radial-gradient(900px 500px at 100% 0%, #F1ECFF 0%, transparent 60%), #FDFDFC; color: #1B1E24; }
      header { position: absolute; left: 64px; top: 34px; width: 1152px; }
      h1 { font-size: 36px; letter-spacing: -0.02em; font-weight: 700; }
      p { margin-top: 6px; font-size: 18px; color: #5A6371; }
      .shot { position: absolute; left: 64px; top: 138px; width: 1024px; height: 640px; border-radius: 14px; overflow: hidden;
        box-shadow: 0 1px 2px rgba(27,30,36,.06), 0 18px 48px rgba(27,30,36,.14); border: 1px solid #ECEAE4; background: #fff; }
      .shot img { width: 1024px; height: 640px; display: block; }
      .pop { position: absolute; right: 40px; top: 110px; width: 372px; border-radius: 14px; overflow: hidden;
        box-shadow: 0 2px 6px rgba(27,30,36,.10), 0 28px 64px rgba(27,30,36,.24); border: 1px solid #ECEAE4; background: #fff; }
      .pop img { width: 372px; display: block; max-height: 660px; object-fit: cover; object-position: top; }
    </style></head><body>
      <header><h1>${shot.title}</h1><p>${shot.sub}</p></header>
      <div class="shot"><img src="${img(page)}"></div>
      ${popup ? `<div class="pop"><img src="${img(popup)}"></div>` : ''}
    </body></html>`);
    await frame.waitForTimeout(300);
    await frame.screenshot({ path: path.join(OUT, shot.file), type: 'png' });
    await frame.close(); await p.close();
    console.error('wrote', shot.file);
  }
  await ctx.close();
})();
