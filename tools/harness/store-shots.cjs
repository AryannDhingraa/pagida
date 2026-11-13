/**
 * Store screenshots, made from the real build.
 *
 * Every shot is the extension running for real: the pages in store-pages/ are
 * served over HTTPS at believable addresses (mapped to this computer with
 * --host-resolver-rules), and the popup, cards and report are Pagida's own,
 * captured at 2x. Only the frame around them is drawn here: a headline, a plain
 * browser window and Pagida's toolbar icon, which is painted with the same
 * code as src/background/icon.ts so it matches the band in the shot.
 *
 * The Pagida service is switched off first and the run stops if it is not, so
 * making screenshots never spends the proxy's quota. Real sites are visited for
 * the "quiet" and report shots, and rdap.org and the other report sources are
 * asked about them, exactly as a person's browser would.
 *
 *   npm run build && node tools/harness/store-shots.cjs
 *   EXT=dist OUT=docs/store CHROME=/path/to/chrome   optional
 *   ONLY=04   remake just the shots whose file name starts with that
 *
 * Needs tools/harness/mail-pages/cert.pem and key.pem (see mail-e2e.cjs).
 * Writes 01..06 at 1280 x 800, no alpha. Chrome takes the first five.
 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const EXT = path.resolve(process.env.EXT || path.join(root, 'dist'));
const OUT = path.resolve(process.env.OUT || path.join(root, 'docs/store'));
const PORT = 8444;

const SIGNIN = 'https://office365-verify-account.com/common/oauth2/login';
const CAPTCHA = 'https://hotel-booking-confirm.com/verify';
const MAIL = 'https://mail.google.com/mail/u/0/#inbox';
const QUIET = 'https://www.commbank.com.au/';

// The browser window in the frame. The page inside it is captured at exactly
// this size, so nothing is scaled and text stays as sharp as it is on screen.
// The scene (window, popup) is laid out at 1:1 and then scaled a little, so a
// full-height popup (Chrome caps popups at 600 px) fits under the headline.
const SCENE = { y: 170, scale: 0.92 };
const WIN = { x: 120, w: 1040, bar: 52 };
const VISIBLE = Math.floor((800 - SCENE.y) / SCENE.scale);
const PAGE = { w: WIN.w, h: VISIBLE - WIN.bar };
const POPUP_MAX = 600;

const shots = [
  { file: '01-tells-you-why.png', url: SIGNIN, popup: true,
    title: 'It tells you why.',
    sub: 'Not just a red screen. One plain sentence about what is wrong, and every reason behind it.' },
  { file: '02-email.png', url: MAIL, expandMail: true,
    title: 'Checks the emails you open.',
    sub: 'In Gmail and Outlook on the web. The email is read on your computer and never sent anywhere.' },
  { file: '03-clickfix.png', url: CAPTCHA, click: '#v', clipboard: true,
    title: 'Fake “verify you are human” pages, defused.',
    sub: 'Pagida swaps the command a fake page puts on your clipboard for a harmless warning.' },
  { file: '04-quiet.png', url: QUIET, popup: true, waitFacts: /years old/,
    title: 'Quiet on the real thing.',
    sub: 'Your bank, your government, the sites you use every week. No crying wolf.' },
  { file: '05-site-report.png', report: 'https://www.wikipedia.org/', tab: 'site',
    title: 'The full story on any site.',
    sub: 'Who owns it, how old it is, where it is hosted. From public records, in plain words.' },
  { file: '06-privacy.png', options: '#what-i-look-up, section:nth-of-type(2)',
    title: 'Only domain names leave your computer.',
    sub: 'No account, no tracking. Every lookup is listed here, and each one has a switch.' },
];

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  const dirs = fs.existsSync(cache) ? fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const d of dirs) for (const arch of ['chrome-mac-arm64', 'chrome-mac']) {
    const exe = path.join(cache, d, arch, 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    if (fs.existsSync(exe)) return exe;
  }
  return undefined;
}

// Same drawing as src/background/icon.ts (drawFrame), run in the frame page.
const ICON_JS = `
function pagidaIcon(canvas, band) {
  const AURORA = { clean: ['#6FEBDA','#7BB4FF','#B49BFF'], caution: ['#8FD0FF','#5C9AF7','#7C88FF'],
    suspicious: ['#FFDC7E','#FFA83D','#F47F2A'], danger: ['#FF8A6B','#E63A2B','#BB1A0F'] };
  const S = 32, c = canvas.getContext('2d'); canvas.width = S * 2; canvas.height = S * 2; c.scale(2, 2);
  const [c1, c2, c3] = AURORA[band] || AURORA.clean;
  c.save(); c.beginPath(); c.arc(S/2, S/2, S/2 - 1, 0, Math.PI*2); c.clip();
  c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, S, S);
  const bloom = (col, x, y, r) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, S, S); };
  bloom(c1, S*.36, S*.30, S*.62); bloom(c2, S*.72, S*.66, S*.60); bloom(c3, S*.42, S*.82, S*.56); c.restore();
  c.strokeStyle = '#FFFFFF'; c.fillStyle = '#FFFFFF'; c.lineWidth = S*.075; c.lineCap = 'round'; c.lineJoin = 'round';
  const angry = band === 'danger' || band === 'suspicious', drop = angry ? S*.045 : 0, tilt = angry ? .30 : 0;
  const brow = (cx, dir) => { c.save(); c.translate(cx, S*.335 + drop); c.rotate(tilt*dir); c.beginPath(); c.moveTo(-S*.105, S*.035); c.quadraticCurveTo(0, -S*.05, S*.105, S*.035); c.stroke(); c.restore(); };
  brow(S*.335, 1); brow(S*.665, -1);
  const r = S * (band === 'danger' ? .098 : .082);
  for (const cx of [S*.35, S*.65]) { c.beginPath(); c.ellipse(cx, S*.545, r, r, 0, 0, Math.PI*2); c.fill(); }
  c.beginPath(); c.moveTo(S*.5, S*.525); c.lineTo(S*.5, S*.655); c.lineTo(S*.575, S*.655); c.stroke();
}`;

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const img = (b) => `data:image/png;base64,${b.toString('base64')}`;

function frameHtml(shot, { page, popup, band, omnibox, secure, clip }) {
  const iconRight = WIN.x + WIN.w - 18;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1280px; height: 800px; overflow: hidden; position: relative; color: #1D1D1F;
    font-family: "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background:
      radial-gradient(900px 420px at 12% -8%, rgba(111,235,218,.22), transparent 62%),
      radial-gradient(820px 420px at 92% -6%, rgba(180,155,255,.22), transparent 60%),
      radial-gradient(700px 360px at 50% 110%, rgba(123,180,255,.14), transparent 70%),
      #FBFBFD; }
  header { position: absolute; left: 0; right: 0; top: 40px; text-align: center; }
  .scene { position: absolute; left: 0; top: ${SCENE.y}px; width: 1280px; height: ${VISIBLE + 40}px;
    transform: scale(${SCENE.scale}); transform-origin: 640px 0; }
  h1 { font-size: 50px; line-height: 1.06; font-weight: 700; letter-spacing: -.034em; }
  p { margin: 14px auto 0; max-width: 820px; font-size: 20px; line-height: 1.38; color: #6E6E73; letter-spacing: -.01em; }
  .win { position: absolute; left: ${WIN.x}px; top: 0; width: ${WIN.w}px; height: ${VISIBLE + 30}px;
    border-radius: 14px; overflow: hidden; background: #fff;
    box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 24px 60px -12px rgba(29,29,31,.20), 0 8px 18px -8px rgba(29,29,31,.12); }
  .bar { height: ${WIN.bar}px; display: flex; align-items: center; gap: 14px; padding: 0 18px; background: #F5F5F7;
    border-bottom: 1px solid #E3E3E8; }
  .dots { display: flex; gap: 8px; margin-right: 6px; } .dots i { width: 12px; height: 12px; border-radius: 50%; display: block; }
  .nav { display: flex; gap: 16px; color: #A1A1A6; font-size: 17px; line-height: 1; }
  .omni { flex: 1; height: 32px; border-radius: 9px; background: #fff; border: 1px solid #E3E3E8; display: flex; align-items: center;
    gap: 8px; padding: 0 12px; font: 13px/1 -apple-system, BlinkMacSystemFont, sans-serif; color: #1D1D1F; letter-spacing: 0; white-space: nowrap; overflow: hidden; }
  .omni .rest { color: #86868B; }
  .omni svg { flex: none; }
  .ext { display: flex; align-items: center; gap: 10px; }
  .ext .puz { width: 18px; height: 18px; color: #86868B; }
  .ext .iris { width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; ${popup ? 'background: #E8E8ED;' : ''} }
  .ext canvas { width: 20px; height: 20px; }
  .page { display: block; width: ${PAGE.w}px; height: ${PAGE.h}px; }
  .pop { position: absolute; top: ${WIN.bar - 6}px; left: ${iconRight - 372 + 10}px; width: 372px;
    border-radius: 12px; overflow: hidden; background: #fff;
    box-shadow: 0 0 0 1px rgba(0,0,0,.08), 0 30px 70px -10px rgba(29,29,31,.32), 0 10px 22px -10px rgba(29,29,31,.22); }
  .pop img { width: 372px; display: block; }
  .clip { position: absolute; left: ${WIN.x + 42}px; top: ${WIN.bar + 448}px; width: 430px; display: flex; gap: 12px; align-items: flex-start;
    padding: 14px 18px; border-radius: 14px; background: rgba(255,255,255,.92); backdrop-filter: blur(12px);
    box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 18px 40px -14px rgba(29,29,31,.28); font: 13px/1.45 -apple-system, sans-serif; color: #1D1D1F; }
  .clip b { display: block; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #86868B; margin-bottom: 4px; }
  .clip code { font: 12.5px/1.45 ui-monospace, "SF Mono", Menlo, monospace; color: #1D1D1F; }
  .clip .k { flex: none; width: 30px; height: 30px; border-radius: 8px; background: #EBF8F2; color: #12A672; display: grid; place-items: center; font-weight: 700; }
  </style></head><body>
  <header><h1>${esc(shot.title)}</h1><p>${esc(shot.sub)}</p></header>
  <div class="scene">
  <div class="win">
    <div class="bar">
      <div class="dots"><i style="background:#FF5F57"></i><i style="background:#FEBC2E"></i><i style="background:#28C840"></i></div>
      <div class="nav"><span>&#x2039;</span><span>&#x203A;</span></div>
      <div class="omni">${secure === 'ext'
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#86868B" stroke-width="2"><path d="M10 3h4v3a2 2 0 1 0 4 0V5h3v5h-1a2 2 0 1 0 0 4h1v6H5v-6h1a2 2 0 1 0 0-4H5V5h5z"/></svg>'
        : '<svg width="12" height="14" viewBox="0 0 12 14"><rect x="1" y="6" width="10" height="7.5" rx="2" fill="#86868B"/><path d="M3.3 6V4.3a2.7 2.7 0 0 1 5.4 0V6" stroke="#86868B" stroke-width="1.6" fill="none"/></svg>'}
        ${omnibox}</div>
      <div class="ext">
        <svg class="puz" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 3h4v3a2 2 0 1 0 4 0V5h3v5h-1a2 2 0 1 0 0 4h1v6H5v-6h1a2 2 0 1 0 0-4H5V5h5z"/></svg>
        <div class="iris"><canvas id="ic"></canvas></div>
      </div>
    </div>
    <img class="page" src="${img(page)}">
  </div>
  ${popup ? `<div class="pop"><img src="${img(popup)}"></div>` : ''}
  ${clip ? `<div class="clip"><div class="k">&#x2713;</div><div><b>Your clipboard now holds</b><code>${esc(clip)}</code></div></div>` : ''}
  </div>
  <script>${ICON_JS}; pagidaIcon(document.getElementById('ic'), ${JSON.stringify(band)});</script>
  </body></html>`;
}

function omniboxFor(url) {
  const u = new URL(url);
  const rest = (u.pathname === '/' ? '' : u.pathname) + u.search + u.hash;
  return `<span>${esc(u.hostname)}</span><span class="rest">${esc(rest)}</span>`;
}

(async () => {
  for (const f of ['cert.pem', 'key.pem']) {
    if (!fs.existsSync(path.join(__dirname, 'mail-pages', f))) { console.error(`missing mail-pages/${f}, see mail-e2e.cjs`); process.exit(1); }
  }
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawn('python3', [path.join(__dirname, 'store-pages/serve.py'), String(PORT)], { stdio: 'ignore' });
  process.on('exit', () => server.kill());
  await new Promise((r) => setTimeout(r, 800));

  const map = ['office365-verify-account.com', 'hotel-booking-confirm.com', 'mail.google.com'].map((h) => `MAP ${h} 127.0.0.1:${PORT}`).join(', ');
  const exe = findChrome();
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'pagida-shots-')), {
    ...(exe ? { executablePath: exe } : {}),
    headless: false, viewport: { width: PAGE.w, height: PAGE.h }, deviceScaleFactor: 2, locale: 'en-AU',
    args: ['--headless=new', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
      `--host-resolver-rules=${map}`, '--ignore-certificate-errors', '--lang=en-AU', '--hide-scrollbars'],
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
  if (!s || s.usePagidaService !== false) { console.error('Pagida service still on, stopping'); await ctx.close(); process.exit(2); }
  console.error('pagida service off');
  const probe = await ctx.newPage();
  await probe.goto(`chrome-extension://${id}/options.html`);

  // Opens the real popup pointed at a tab, the way clicking the icon would.
  async function openPopup(p, height) {
    const tabId = await probe.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)?.id, p.url());
    const pop = await ctx.newPage();
    await pop.addInitScript((tid) => {
      const query = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = async (q) => (q && q.active ? [await chrome.tabs.get(tid)] : query(q));
    }, tabId);
    await pop.setViewportSize({ width: 372, height });
    await pop.goto(`chrome-extension://${id}/popup.html`);
    await pop.waitForFunction(() => document.querySelector('[data-band]'), null, { timeout: 15000 }).catch(() => {});
    return pop;
  }
  const bandOf = (pop) => pop.evaluate(() => document.querySelector('[data-band]')?.getAttribute('data-band') || 'clean');
  const factsFilled = (pop, want) => pop.evaluate((w) => !/checking|No answer yet/.test(document.body.innerText) && new RegExp(w).test(document.body.innerText), want.source);

  for (const shot of shots.filter((x) => !process.env.ONLY || x.file.startsWith(process.env.ONLY))) {
    let page, popup = null, band = 'clean', omnibox, secure = 'lock', clip = null;

    if (shot.url) {
      let p = await ctx.newPage();
      if (shot.click) await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(shot.url).origin });
      await p.goto(shot.url, { waitUntil: 'load', timeout: 30000 }).catch(() => {});
      await p.waitForTimeout(3000);

      if (shot.waitFacts) {
        // Site age and hosting come from public lookups that sometimes miss.
        // Reopen the popup a few times, as a person would, until they answer.
        let ok = false;
        for (let i = 0; i < 5 && !ok; i++) {
          const probePop = await openPopup(p, 600);
          for (let t = 0; t < 25 && !ok; t++) { await probePop.waitForTimeout(1000); ok = await factsFilled(probePop, shot.waitFacts); }
          await probePop.close();
        }
        if (!ok) console.error('facts never filled for', shot.url);
      }
      if (shot.click) {
        await p.click(shot.click);
        await p.waitForTimeout(2500);
        clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => null);
        console.error('clipboard after click:', JSON.stringify(clip));
      }
      if (shot.expandMail) {
        // The card lives in a closed shadow root. DevTools can still see into it,
        // so find the button there and click its spot the way a person would.
        const cdp = await ctx.newCDPSession(p);
        const { root: doc } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
        const find = (n) => {
          if (n.nodeName === 'BUTTON' && (n.children || []).some((c) => c.nodeValue === 'Show me why')) return n;
          for (const c of [...(n.children || []), ...(n.shadowRoots || [])]) { const f = find(c); if (f) return f; }
          return null;
        };
        const btn = find(doc);
        if (btn) {
          const { model } = await cdp.send('DOM.getBoxModel', { nodeId: btn.nodeId });
          const q = model.content;
          await p.mouse.click((q[0] + q[4]) / 2, (q[1] + q[5]) / 2);
        } else console.error('email card button not found');
        await p.waitForTimeout(900);
      }

      const pop = await openPopup(p, POPUP_MAX);
      if (shot.popup) {
        await pop.waitForFunction(() => !/checking/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
        await pop.waitForTimeout(600);
        // Chrome sizes a popup to its content, up to 600 px, and scrolls the rest.
        const h = await pop.evaluate(() => Math.ceil(document.body.getBoundingClientRect().height));
        await pop.setViewportSize({ width: 372, height: Math.min(h, POPUP_MAX) });
        await pop.waitForTimeout(400);
        // With the popup open, Iris's card on the page would only peek out behind it.
        await p.evaluate(() => document.getElementById('pagida-companion-host')?.remove());
        popup = await pop.screenshot({ type: 'png' });
      }
      band = await bandOf(pop);
      await pop.close();
      await p.bringToFront();
      page = await p.screenshot({ type: 'png' });
      omnibox = omniboxFor(p.url());
      await p.close();
    } else if (shot.report) {
      const r = await ctx.newPage();
      await r.goto(`chrome-extension://${id}/report.html?u=${encodeURIComponent(shot.report)}`);
      await r.waitForTimeout(20000);
      await r.click(`[data-tab="${shot.tab}"]`); await r.waitForTimeout(800);
      // Registration data comes from rdap.org, which sometimes misses. Ask again, as a person would.
      for (let i = 0; i < 3 && /Age\s*Unknown/.test(await r.evaluate(() => document.body.innerText)); i++) {
        await r.locator('text=Check again').first().click().catch(() => {});
        await r.waitForTimeout(15000);
        await r.click(`[data-tab="${shot.tab}"]`); await r.waitForTimeout(800);
      }
      band = await r.evaluate(() => document.documentElement.getAttribute('data-band') || 'clean');
      page = await r.screenshot({ type: 'png' });
      omnibox = `<span>Pagida</span><span class="rest">&nbsp;&nbsp;chrome-extension://…/report.html</span>`;
      secure = 'ext'; band = 'clean';
      await r.close();
    } else if (shot.options) {
      const o = await ctx.newPage();
      await o.goto(`chrome-extension://${id}/options.html`); await o.waitForTimeout(800);
      // Load the public scam lists first, so the row shows them as loaded.
      await o.locator('text=Update now').first().click().catch(() => {});
      await o.waitForFunction(() => !/not loaded yet|Updating/.test(document.body.innerText), null, { timeout: 120000 }).catch(() => console.error('scam list still loading'));
      await o.evaluate(() => {
        const h = [...document.querySelectorAll('h2')].find((e) => /What I look up/.test(e.textContent));
        if (h) window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 28);
      });
      await o.waitForTimeout(500);
      page = await o.screenshot({ type: 'png' });
      omnibox = `<span>Pagida</span><span class="rest">&nbsp;&nbsp;chrome-extension://…/options.html</span>`;
      secure = 'ext';
      await o.close();
    }

    const frame = await ctx.newPage();
    await frame.setViewportSize({ width: 1280, height: 800 });
    await frame.setContent(frameHtml(shot, { page, popup, band, omnibox, secure, clip }));
    await frame.waitForTimeout(400);
    // scale 'css': the stores want exactly 1280 x 800. The 2x captures inside
    // are downsampled into it, which keeps text crisp.
    await frame.screenshot({ path: path.join(OUT, shot.file), type: 'png', scale: 'css' });
    await frame.close();
    console.error('wrote', shot.file, 'band', band);
  }
  await ctx.close();
  process.exit(0);
})();
