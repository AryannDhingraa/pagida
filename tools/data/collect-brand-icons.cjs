// Collects reference favicon hashes for src/core/data/icons.ts, hashing in
// Chromium with the same canvas path the extension uses.
//   npx esbuild src/core/util/dhash.ts --bundle --format=iife --global-name=__D --outfile=dhash.js
//   echo 'self.__dhash = __D.dhashFromRgba;' >> dhash.js
//   node tools/data/collect-brand-icons.cjs   (writes icons.json)
const { chromium } = require('playwright');
const fs = require('fs');
const sites = {
  microsoft: ['https://login.microsoftonline.com/', 'https://login.live.com/', 'https://www.microsoft.com/', 'https://www.office.com/', 'https://outlook.live.com/owa/', 'https://onedrive.live.com/'],
  google: ['https://accounts.google.com/', 'https://www.google.com/', 'https://mail.google.com/', 'https://drive.google.com/'],
  apple: ['https://account.apple.com/sign-in', 'https://www.apple.com/', 'https://www.icloud.com/'],
  paypal: ['https://www.paypal.com/au/home'],
  facebook: ['https://www.facebook.com/'],
  instagram: ['https://www.instagram.com/'],
  netflix: ['https://www.netflix.com/login'],
  amazon: ['https://www.amazon.com.au/', 'https://www.amazon.com/'],
  linkedin: ['https://www.linkedin.com/'],
  dropbox: ['https://www.dropbox.com/login'],
  adobe: ['https://www.adobe.com/', 'https://auth.services.adobe.com/en_US/index.html'],
  docusign: ['https://account.docusign.com/', 'https://www.docusign.com/'],
  commbank: ['https://www.commbank.com.au/', 'https://netbank.web.commbank.com.au/auth/logon'],
  anz: ['https://www.anz.com.au/', 'https://login.anz.com/internetbanking'],
  westpac: ['https://www.westpac.com.au/'],
  nab: ['https://www.nab.com.au/', 'https://ib.nab.com.au/login'],
  auspost: ['https://auspost.com.au/'],
  mygov: ['https://my.gov.au/'],
  steam: ['https://store.steampowered.com/', 'https://steamcommunity.com/'],
  coinbase: ['https://www.coinbase.com/'],
  binance: ['https://www.binance.com/en'],
  metamask: ['https://metamask.io/'],
  dhl: ['https://www.dhl.com/au-en/home.html'],
  fedex: ['https://www.fedex.com/en-au/home.html'],
  ups: ['https://www.ups.com/au/en/Home.page'],
  usps: ['https://www.usps.com/'],
  wellsfargo: ['https://www.wellsfargo.com/'],
  chase: ['https://www.chase.com/'],
  bankofamerica: ['https://www.bankofamerica.com/'],
  yahoo: ['https://login.yahoo.com/'],
  roblox: ['https://www.roblox.com/'],
  discord: ['https://discord.com/'],
  whatsapp: ['https://web.whatsapp.com/'],
  spotify: ['https://www.spotify.com/au/'],
  ebay: ['https://www.ebay.com.au/'],
  zoom: ['https://zoom.us/'],
  wetransfer: ['https://wetransfer.com/'],
  telstra: ['https://www.telstra.com.au/'],
  optus: ['https://www.optus.com.au/'],
  linkt: ['https://www.linkt.com.au/'],
  ato: ['https://www.ato.gov.au/'],
  trustwallet: ['https://trustwallet.com/'],
  capitalone: ['https://www.capitalone.com/'],
  stripe: ['https://stripe.com/'],
  github: ['https://github.com/login'],
  outlook: ['https://outlook.office.com/'],
  sharepoint: ['https://www.microsoft.com/en-au/microsoft-365/sharepoint/collaboration'],
};
(async () => {
  const b = await chromium.launch({ args: process.env.HTTPS_PROXY ? ['--proxy-server=' + process.env.HTTPS_PROXY] : [] });
  const ctx = await b.newContext({ ignoreHTTPSErrors: true, locale: 'en-AU', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' });
  const out = {};
  const jobs = Object.entries(sites).flatMap(([brand, urls]) => urls.map((u) => [brand, u]));
  const hashSrc = fs.readFileSync(process.env.DHASH_JS || 'dhash.js', 'utf8');
  async function run([brand, url]) {
    const p = await ctx.newPage();
    try { await p.goto(url, { waitUntil: 'load', timeout: 25000 }); } catch {}
    await p.waitForTimeout(3000);
    const icons = await p.evaluate(async (hashSrc) => {
      eval(hashSrc);
      const hrefs = [...document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[rel="mask-icon"]')].map(l => l.href);
      hrefs.push(new URL('/favicon.ico', location.href).href);
      const res = [];
      for (const h of [...new Set(hrefs)].slice(0, 8)) {
        try {
          const blob = await (await fetch(h, { credentials: 'omit' })).blob();
          if (/svg/.test(blob.type)) continue;
          const bmp = await createImageBitmap(blob);
          const c = new OffscreenCanvas(9, 8); const g = c.getContext('2d');
          g.drawImage(bmp, 0, 0, 9, 8);
          res.push({ h, hash: self.__dhash(g.getImageData(0, 0, 9, 8).data) });
        } catch (e) {}
      }
      return res;
    }, hashSrc).catch(() => []);
    for (const i of icons) (out[brand] ??= []).push(i);
    await p.close();
  }
  const q = [...jobs];
  await Promise.all(Array.from({ length: 6 }, async () => { while (q.length) await run(q.shift()); }));
  fs.writeFileSync('icons.json', JSON.stringify(out, null, 1));
  await b.close();
})();
