/**
 * Store promo tiles and the brand board, drawn with Iris's own code.
 *
 * src/ui/iris.ts is bundled on the spot, so the Iris in these images is the
 * same one people see in the popup, not a copy. The brand board also borrows a
 * slice of 01-tells-you-why.png, so run store-shots.cjs first.
 *
 *   node tools/harness/store-tiles.cjs            (writes into docs/store)
 *   OUT=some/dir node tools/harness/store-tiles.cjs
 *
 * Writes promo-small-440x280.png, promo-marquee-1400x560.png, logo-300.png and
 * brand-board.png. Tiles have no screenshots in them, which the stores require.
 */
const { chromium } = require('playwright');
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const OUT = path.resolve(process.env.OUT || path.join(root, 'docs/store'));

const iris = esbuild.buildSync({
  entryPoints: [path.join(root, 'src/ui/iris.ts')], bundle: true, format: 'iife', globalName: 'PagidaIris', write: false,
}).outputFiles[0].text;

// Tokens from src/shared/theme.css, so the tiles and the extension agree.
const T = {
  ink: '#1B1E24', ink2: '#5A6371', ink3: '#8A929E', line: '#ECEAE4', paper: '#FDFDFC', brand: '#7B6BF0',
  aur: ['#6FEBDA', '#7BB4FF', '#B49BFF'],
  safe: '#12A672', notice: '#3D7FEA', caution: '#C67C0A', danger: '#DC3E31',
};
const FONT = '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

const BASE = `
  * { box-sizing: border-box; margin: 0; }
  body { font-family: ${FONT}; color: ${T.ink}; -webkit-font-smoothing: antialiased; overflow: hidden; }
  .aurora { background:
      radial-gradient(70% 90% at 8% 0%, rgba(111,235,218,.30), transparent 60%),
      radial-gradient(70% 90% at 100% 10%, rgba(180,155,255,.30), transparent 60%),
      radial-gradient(60% 70% at 55% 115%, rgba(123,180,255,.22), transparent 70%), ${T.paper}; }
  .word { font-weight: 700; letter-spacing: -.035em; }
  [data-iris] { display: inline-block; }
`;

// Each [data-iris] element becomes a still Iris: band, size and face from attributes.
const MOUNT = `
  ${iris}
  PagidaIris.injectIrisCss(document);
  for (const el of document.querySelectorAll('[data-iris]')) {
    // Read the wanted face first: the constructor sets data-face to "calm".
    const band = el.dataset.iris || 'clean';
    const face = el.dataset.face || PagidaIris.expressionForBand(band);
    const ir = new PagidaIris.Iris(el, { size: +el.dataset.size || 120, interactive: false });
    ir.setBand(band);
    ir.setExpression(face);
  }
`;

const page = (w, h, css, body) => `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
  body { width: ${w}px; height: ${h}px; } ${css}</style></head><body>${body}<script>${MOUNT}</script></body></html>`;

const small = page(440, 280, `
  body { display: grid; place-items: center; text-align: center; }
  .word { font-size: 46px; margin-top: 10px; }
  p { font-size: 17px; color: ${T.ink2}; margin-top: 2px; letter-spacing: -.01em; }
`, `<div class="aurora" style="position:absolute;inset:0"></div>
  <div style="position:relative"><div data-iris="clean" data-size="104"></div>
  <div class="word">Pagida</div><p>It tells you why.</p></div>`);

const marquee = page(1400, 560, `
  .copy { position: absolute; left: 120px; top: 50%; transform: translateY(-50%); width: 640px; }
  .kicker { display: flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 600; color: ${T.brand}; letter-spacing: -.01em; }
  h1 { font-size: 84px; line-height: 1.02; font-weight: 700; letter-spacing: -.045em; margin-top: 18px; }
  p { font-size: 25px; line-height: 1.4; color: ${T.ink2}; margin-top: 22px; letter-spacing: -.012em; }
  .hero { position: absolute; left: 1010px; top: 50%; transform: translate(-50%, -50%); }
`, `<div class="aurora" style="position:absolute;inset:0"></div>
  <div class="copy"><div class="kicker">Pagida</div>
    <h1>It tells you why.</h1>
    <p>Spots phishing pages and scam emails, and explains each one in a single plain sentence.</p></div>
  <div class="hero"><div data-iris="clean" data-size="300"></div></div>`);

// Edge's extension logo is the store icon itself, larger, so both stores show one mark.
const icon = fs.readFileSync(path.join(root, 'public/icons/icon512.png')).toString('base64');
const logo = page(300, 300, `body { display: grid; place-items: center; background: #fff; } img { width: 300px; height: 300px; }`,
  `<img src="data:image/png;base64,${icon}">`);

function board(shot) {
  const swatch = (name, hex, dark) => `<div class="sw"><i style="background:${hex};${dark ? '' : `box-shadow: inset 0 0 0 1px ${T.line};`}"></i><b>${name}</b><span>${hex}</span></div>`;
  return page(1600, 1000, `
  body { background: #F2F2F4; }
  .grid { position: absolute; inset: 40px; display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: 1fr 1fr; gap: 20px; }
  .p { position: relative; border-radius: 22px; background: #fff; overflow: hidden; padding: 34px; }
  .n { position: absolute; left: 34px; bottom: 26px; font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: ${T.ink3}; font-weight: 600; }
  .n.l { color: rgba(255,255,255,.55); }
  .n.chip { left: 22px; top: 22px; bottom: auto; padding: 7px 12px; border-radius: 9px; background: rgba(255,255,255,.94);
    box-shadow: 0 0 0 1px rgba(0,0,0,.05), 0 6px 16px -8px rgba(0,0,0,.2); }
  .center { display: grid; place-items: center; text-align: center; height: 100%; }
  .cover .word { font-size: 64px; margin-top: 14px; }
  .cover p { font-size: 15px; color: ${T.ink2}; margin-top: 4px; }
  .bands { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 66px; text-align: center; }
  .bands b { display: block; font-size: 13px; margin-top: 12px; letter-spacing: -.01em; }
  h2 { font-size: 26px; letter-spacing: -.03em; font-weight: 700; }
  .sub { font-size: 14px; color: ${T.ink2}; margin-top: 6px; line-height: 1.45; }
  .shot { position: absolute; inset: 0; background: url(${shot}) no-repeat; background-size: 1180px auto; background-position: -620px -150px; }
  .voice { background: ${T.ink}; color: #fff; }
  .voice h1 { font-size: 60px; line-height: 1.02; letter-spacing: -.045em; font-weight: 700; margin-top: 110px; }
  .voice p { color: rgba(255,255,255,.62); font-size: 18px; margin-top: 18px; line-height: 1.45; }
  .sws { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px 10px; margin-top: 26px; }
  .sw i { display: block; height: 58px; border-radius: 12px; }
  .sw b { display: block; font-size: 12.5px; margin-top: 8px; } .sw span { font: 11px ${MONO}; color: ${T.ink3}; }
  .aa { font-size: 150px; font-weight: 700; letter-spacing: -.06em; line-height: 1; margin-top: 18px; }
  .spec { font-size: 15px; color: ${T.ink2}; margin-top: 16px; line-height: 1.5; }
  .mono { font: 15px ${MONO}; color: ${T.ink}; margin-top: 14px; padding: 10px 14px; background: #F6F6F3; border-radius: 10px; display: inline-block; }
  `, `<div class="grid">
    <div class="p cover aurora"><div class="center"><div><div data-iris="clean" data-size="150"></div>
      <div class="word">Pagida</div><p>Phishing detector for Chrome and Edge</p></div></div><div class="n">01 · Mark</div></div>

    <div class="p"><h2>Her face is the verdict.</h2><div class="sub">Colour and expression carry the answer before a word is read.</div>
      <div class="bands">
        <div><div data-iris="clean" data-size="84"></div><b style="color:${T.safe}">Looks fine</b></div>
        <div><div data-iris="caution" data-size="84"></div><b style="color:${T.notice}">Worth a look</b></div>
        <div><div data-iris="suspicious" data-size="84"></div><b style="color:${T.caution}">Suspicious</b></div>
        <div><div data-iris="danger" data-size="84"></div><b style="color:${T.danger}">Likely phishing</b></div>
      </div><div class="n">02 · Iris</div></div>

    <div class="p" style="padding:0"><div class="shot"></div><div class="n chip">03 · In the browser</div></div>

    <div class="p voice"><h1>It tells you why.</h1><p>Plain words. One sentence.<br>Every reason shown. No crying wolf.</p><div class="n l">04 · Voice</div></div>

    <div class="p"><h2>Light Aurora</h2><div class="sub">Calm by default. Colour is saved for the verdict.</div>
      <div class="sws">
        ${swatch('Ink', T.ink, true)}${swatch('Iris violet', T.brand, true)}${swatch('Aurora mint', T.aur[0], true)}${swatch('Aurora sky', T.aur[1], true)}
        ${swatch('Looks fine', T.safe, true)}${swatch('Worth a look', T.notice, true)}${swatch('Suspicious', T.caution, true)}${swatch('Likely phishing', T.danger, true)}
      </div><div class="n">05 · Colour</div></div>

    <div class="p"><div class="aa">Aa</div>
      <div class="spec">The system's own type: SF Pro on Apple, Segoe UI on Windows. Addresses in mono, so a swapped letter is easy to spot.</div>
      <div class="mono">office365-verify-account.com</div><div class="n">06 · Type</div></div>
  </div>`);
}

// Chrome for Testing that Playwright already cached, or CHROME.
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const cache = path.join(require('os').homedir(), 'Library/Caches/ms-playwright');
  const dirs = fs.existsSync(cache) ? fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const d of dirs) for (const arch of ['chrome-mac-arm64', 'chrome-mac']) {
    const exe = path.join(cache, d, arch, 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    if (fs.existsSync(exe)) return exe;
  }
  return undefined;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(findChrome() ? { executablePath: findChrome() } : {});
  const shotPath = path.join(OUT, '01-tells-you-why.png');
  const shot = fs.existsSync(shotPath) ? `data:image/png;base64,${fs.readFileSync(shotPath).toString('base64')}` : '';
  const jobs = [
    ['promo-small-440x280.png', 440, 280, small],
    ['promo-marquee-1400x560.png', 1400, 560, marquee],
    ['logo-300.png', 300, 300, logo],
    ['brand-board.png', 1600, 1000, board(shot)],
  ];
  for (const [file, w, h, html] of jobs) {
    const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await p.setContent(html);
    await p.waitForTimeout(1500);
    await p.screenshot({ path: path.join(OUT, file), type: 'png', scale: 'css' });
    await p.close();
    console.error('wrote', file);
  }
  await browser.close();
})();
