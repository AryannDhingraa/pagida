// End-to-end check of email protection in a real Chromium with the built extension.
// The mock inbox pages are served over HTTPS on 127.0.0.1:443 and Chromium is told that
// mail.google.com and outlook.office.com live there, so the content script runs exactly
// as it would on the real sites. The Pagida lookup service is forced off.
//
//   (cd tools/harness/mail-pages && openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem \
//      -out cert.pem -days 30 -subj /CN=pagida-test && sudo python3 serve.py 443)
//   EXT=dist node tools/harness/mail-e2e.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const EXT = path.resolve(process.env.EXT || 'dist');

const cases = [
  { url: 'https://mail.google.com/gmail-phish.html', expect: 'danger', link: 'a[href*="google.com/url"]' },
  { url: 'https://mail.google.com/gmail-legit.html', expect: null },
  { url: 'https://outlook.office.com/outlook-phish.html', expect: 'danger', link: 'a[href*="safelinks"]' },
  { url: 'https://outlook.office.com/outlook-legit.html', expect: null },
  { url: 'https://outlook.office.com/outlook-mailbox.html', expect: 'danger', link: 'a[href*="safelinks"]' },
];

(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(require('os').tmpdir(), 'pagida-mail-')), {
    headless: false,
    args: ['--headless=new', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
      '--host-resolver-rules=MAP mail.google.com 127.0.0.1, MAP outlook.office.com 127.0.0.1, MAP *.google.com ~NOTFOUND',
      '--ignore-certificate-errors', '--no-proxy-server'],
  });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  await new Promise((r) => setTimeout(r, 1500));
  const off = await sw.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...(settings || {}), usePagidaService: false } });
    return (await chrome.storage.local.get('settings')).settings.usePagidaService;
  });
  if (off !== false) { console.error('lookup service still on, stopping'); process.exit(1); }

  let failures = 0;
  for (const c of cases) {
    const p = await ctx.newPage();
    await p.goto(c.url);
    await p.waitForTimeout(3500);
    const card = await p.evaluate(() => {
      const el = document.querySelector('.pagida-mail-card');
      return el ? { band: el.dataset.band, conclusions: el.dataset.conclusions } : null;
    });
    let guard = '';
    if (c.link) {
      let asked = null;
      p.once('dialog', async (d) => { asked = d.message(); await d.dismiss(); });
      const before = p.url();
      await p.click(c.link).catch(() => {});
      await p.waitForTimeout(800);
      guard = asked && p.url() === before ? `link held: "${asked.split('\n')[0]}"` : `LINK NOT HELD (dialog=${!!asked})`;
      if (!asked) failures++;
    }
    const ok = c.expect ? card?.band === c.expect : card === null;
    if (!ok) failures++;
    console.log(ok ? 'PASS' : 'FAIL', c.url.replace('https://', '').padEnd(40), card ? `${card.band} [${card.conclusions}]` : 'no card', guard ? '\n     ' + guard : '');
    await p.close();
  }
  // QR decoding in the worker, on a real image fetched over the network.
  const id = new URL(sw.url()).host;
  const probe = await ctx.newPage();
  await probe.goto(`chrome-extension://${id}/options.html`);
  const qr = await probe.evaluate(() => chrome.runtime.sendMessage({ type: 'EMAIL_SIGNALS', imageUrls: ['https://mail.google.com/qr.png'],
    email: { client: 'test', fromName: 'IT Help Desk', fromAddress: 'it@acme-corp.com', subject: 'MFA reset', bodyText: 'Scan the QR code to verify your account.', links: [], attachments: [] } }));
  const qrSig = (qr.verdict?.signals || []).find((s) => s.id === 'qr_code');
  const qrOk = !!qrSig && qr.verdict.conclusions.some((c) => c.id === 'qr_to_bad_page');
  if (!qrOk) failures++;
  console.log(qrOk ? 'PASS' : 'FAIL', 'QR decoded in worker'.padEnd(40), qrSig ? qrSig.title : 'no QR read', '|', qr.verdict?.band);

  const stats = await sw.evaluate(async () => (await chrome.storage.local.get('stats')).stats);
  console.log('stats', JSON.stringify(stats));
  await ctx.close();
  process.exit(failures ? 1 : 0);
})();
