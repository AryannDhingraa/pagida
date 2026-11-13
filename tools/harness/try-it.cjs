/**
 * Try Pagida by hand, safely. Opens a separate test browser (its own throwaway
 * profile, nothing shared with your normal Chrome) with the built extension,
 * serves the local attack pages and the mock webmail, and opens a start page
 * with every test page and what Pagida should say about it.
 *
 * The Pagida service is switched off in this profile before anything opens,
 * so clicking around never spends the proxy's quota. Real websites still work.
 *
 *   npm run build && node tools/harness/try-it.cjs
 *   CHROME=/path/to/chrome   optional, any Chromium already on disk
 *
 * The mock webmail needs tools/harness/mail-pages/cert.pem and key.pem; the
 * command to make them is at the top of mail-e2e.cjs. Without them the email
 * links on the start page simply do not load.
 *
 * Close the browser window to stop everything.
 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const EXT = path.resolve(process.env.EXT || path.join(root, 'dist'));
const attack = (n) => `http://${n}-site.pagidatest.com:8098/${n}.html`;

// Chrome itself no longer loads unpacked extensions from the command line, so
// this uses Chrome for Testing: CHROME if given, else the one Playwright cached.
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const cache = path.join(require('os').homedir(), 'Library/Caches/ms-playwright');
  const dirs = fs.existsSync(cache) ? fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const d of dirs) {
    for (const arch of ['chrome-mac-arm64', 'chrome-mac']) {
      const exe = path.join(cache, d, arch, 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
      if (fs.existsSync(exe)) return exe;
    }
  }
  return undefined;
}

const PAGES = [
  ['Attack pages (fake, served from this computer)', [
    [attack('cbank'), 'A copy of a bank sign-in page', 'Likely phishing'],
    [attack('mslogin'), 'A copy of the Microsoft sign-in page', 'Likely phishing'],
    [attack('clickfix'), '"Verify you are human", click the button', 'Likely phishing, and the command it copies is replaced'],
    [attack('framecopy'), 'The same trick through a hidden frame', 'Likely phishing'],
    [attack('seed'), 'Asks for a crypto recovery phrase', 'Likely phishing'],
    [attack('tech'), 'Fake virus warning', 'Likely phishing'],
    [attack('bitb'), 'Fake pop-up login window', 'Likely phishing'],
    [attack('telegram'), 'Sends what you type to a Telegram bot', 'Likely phishing'],
  ]],
  ['Honest look-alikes (should stay calm)', [
    [attack('devdocs'), 'A developer install page with a copy button', 'Worth a look at most (it is http), never red'],
    [attack('shop'), 'A shop checkout asking for a card', 'Worth a look at most (it is http), never red'],
  ]],
  ['Emails (mock Gmail and Outlook)', [
    ['https://mail.google.com/gmail-phish.html', 'A "CommBank" email sent from gmail.com', 'Red card above the email, link asks before opening'],
    ['https://mail.google.com/gmail-legit.html', 'A normal email', 'Nothing, or a quiet "checked" line'],
    ['https://outlook.office.com/outlook-phish.html', 'Phishing in Outlook', 'Red card above the email'],
    ['https://outlook.office.com/outlook-legit.html', 'A normal Outlook email', 'Nothing'],
  ]],
  ['Real sites (should be quiet)', [
    ['https://www.commbank.com.au/', 'The real CommBank', 'Nothing found'],
    ['https://my.gov.au/', 'myGov', 'Nothing found'],
    ['https://www.ato.gov.au/', 'The ATO', 'Nothing found'],
    ['https://www.gov.uk/', 'UK government (your friend\'s case: a government site abroad)', 'Nothing found'],
    ['https://www.india.gov.in/', 'Indian government', 'Nothing found'],
    ['https://www.rmit.edu.au/', 'RMIT', 'Nothing found'],
    ['https://www.wikipedia.org/', 'Wikipedia', 'Nothing found'],
  ]],
  ['Google\'s public test page', [
    ['http://testsafebrowsing.appspot.com/s/phishing.html', 'A harmless test page with a password box over http', 'Suspicious: the password would travel unencrypted'],
  ]],
];

(async () => {
  const servers = [
    spawn('python3', ['-m', 'http.server', '8098', '--bind', '127.0.0.1'], { cwd: path.join(__dirname, 'attack-pages'), stdio: 'ignore' }),
  ];
  const mail = path.join(__dirname, 'mail-pages');
  const haveCert = fs.existsSync(path.join(mail, 'cert.pem')) && fs.existsSync(path.join(mail, 'key.pem'));
  if (haveCert) servers.push(spawn('python3', ['serve.py', '8443'], { cwd: mail, stdio: 'ignore' }));
  else console.error('no cert in mail-pages, the email pages will not load (see mail-e2e.cjs)');
  const stop = () => { for (const s of servers) s.kill(); };
  process.on('exit', stop);
  process.on('SIGINT', () => process.exit(0));

  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(require('os').tmpdir(), 'pagida-try-')), {
    ...(findChrome() ? { executablePath: findChrome() } : {}),
    headless: false,
    viewport: null,
    args: [...(process.env.HEADLESS ? ['--headless=new'] : []), `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
      '--host-resolver-rules=MAP *.pagidatest.com 127.0.0.1, MAP mail.google.com 127.0.0.1:8443, MAP outlook.office.com 127.0.0.1:8443',
      '--ignore-certificate-errors', '--proxy-bypass-list=*.pagidatest.com;127.0.0.1', '--lang=en-AU',
      '--unsafely-treat-insecure-origin-as-secure=' + ['clickfix', 'framecopy', 'devdocs'].map((n) => `http://${n}-site.pagidatest.com:8098`).join(',')],
  });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  await new Promise((r) => setTimeout(r, 1500));
  await sw.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...(settings || {}), usePagidaService: false } });
  });
  const s = await sw.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
  if (!s || s.usePagidaService !== false) { console.error('Pagida service still on, stopping'); await ctx.close(); process.exit(2); }

  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const html = `<!doctype html><meta charset="utf-8"><title>Try Pagida</title><style>
    body{font:15px/1.5 -apple-system,"Segoe UI",sans-serif;max-width:900px;margin:32px auto;padding:0 16px;color:#1B1E24}
    h1{font-size:26px;margin:0 0 4px} h2{font-size:17px;margin:28px 0 8px} p{color:#5A6371;margin:0}
    table{border-collapse:collapse;width:100%} td{padding:8px 10px;border-bottom:1px solid #ECEAE4;vertical-align:top}
    td:last-child{color:#5A6371;width:38%} a{color:#7B6BF0}</style>
    <h1>Try Pagida</h1><p>Open each page, then click the Pagida icon in the toolbar (pin it from the puzzle-piece menu). This browser is separate from your normal Chrome, and the online lookup service is off. Never type a real password anywhere.</p>
    ${PAGES.map(([title, rows]) => `<h2>${esc(title)}</h2><table>${rows.map(([u, what, expect]) => `<tr><td><a href="${u}" target="_blank">${esc(what)}</a></td><td>${esc(expect)}</td></tr>`).join('')}</table>`).join('')}`;
  const start = path.join(require('os').tmpdir(), 'pagida-try-start.html');
  fs.writeFileSync(start, html);
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto('file://' + start);
  console.error('Test browser open. Close its window to stop.');
  // HEADLESS=1 is only for checking that it starts.
  if (process.env.HEADLESS) { console.error('start page:', await page.title()); await ctx.close(); process.exit(0); }
  ctx.on('close', () => process.exit(0));
})();
