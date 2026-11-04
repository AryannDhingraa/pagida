/**
 * Tier 2b — v5 offline rules.
 *
 * These read what the page is built from and what it does, using evidence the
 * content script gathered on the machine. None of them needs a network call,
 * which is the point of v5: the engine stands on its own and the Web Risk
 * proxy is a backup.
 */
import type { Rule, Signal } from '../types.js';
import { parseHost } from '../util/domain.js';
import { brandName, falseClaims, trustedName, asksForSecret } from '../identity.js';

const sig = (s: Signal): Signal => s;
const reg = (hostname: string) => parseHost(hostname).registrableDomain;

/** The page is built from a brand's own sign-in page, on someone else's domain. */
export const copiedSignInPage: Rule = (e) => {
  const fp = falseClaims(e).find((c) => c.how === 'fingerprint');
  if (!fp || trustedName(reg(e.hostname))) return null;
  const b = brandName(fp.brand);
  return sig({
    id: 'copied_sign_in_page',
    title: `Built like ${b}'s sign-in page`,
    detail: `This page has the exact structure of ${b}'s own sign-in page, but it is on ${reg(e.hostname)}. Copied and relayed sign-in pages look like this.`,
    tier: 'dom',
    weight: 30,
  });
};

/** The page shows a brand's logo or favicon, matched by image fingerprint. */
export const borrowedLogo: Rule = (e) => {
  const c = falseClaims(e).find((x) => x.how === 'logo');
  if (!c || trustedName(reg(e.hostname))) return null;
  const b = brandName(c.brand);
  return sig({
    id: 'borrowed_brand_logo',
    title: `Shows ${b}'s logo`,
    detail: `The icon on this page matches ${b}'s own, but the site is ${reg(e.hostname)}.`,
    tier: 'dom',
    weight: 16,
  });
};

/** Styles, scripts or images loaded straight from a brand's sign-in servers. */
export const borrowedAssets: Rule = (e) => {
  const c = falseClaims(e).find((x) => x.how === 'assets');
  if (!c || trustedName(reg(e.hostname))) return null;
  const b = brandName(c.brand);
  return sig({
    id: 'borrowed_brand_assets',
    title: `Loads its look from ${b}'s servers`,
    detail: `This sign-in page pulls its design straight from ${b}'s own servers, but it is not a ${b} site.`,
    tier: 'dom',
    weight: 14,
  });
};

/** A crypto recovery phrase is never typed into a website. */
export const seedPhraseRequest: Rule = (e) => {
  if (!e.dom?.asksSeedPhrase) return null;
  return sig({
    id: 'seed_phrase_request',
    title: 'Asks for a wallet recovery phrase',
    detail: 'This page wants your crypto wallet’s secret recovery phrase. No real wallet, exchange or support team ever asks for it on a website. Whoever has it owns your wallet.',
    tier: 'dom',
    weight: 45,
  });
};

/** The page sends what you type to a bot, a webhook or a free form relay. */
export const dataToStranger: Rule = (e) => {
  const d = e.dom;
  if (!d) return null;
  if (d.exfilTarget && asksForSecret(e)) {
    return sig({
      id: 'secret_sent_to_relay',
      title: `What you type goes to ${d.exfilTarget}`,
      detail: `The form on this page sends its contents to ${d.exfilTarget}, not to the company it claims to be. That is how stolen logins are collected.`,
      tier: 'dom',
      weight: 35,
    });
  }
  if (d.botExfil && !trustedName(reg(e.hostname))) {
    return sig({
      id: 'bot_address_in_page',
      title: 'Page code talks to a chat bot',
      detail: 'This page’s code contains a Telegram bot or Discord webhook address. Phishing kits use these to send stolen details to the attacker.',
      tier: 'dom',
      weight: 22,
    });
  }
  return null;
};

/** ClickFix: a command on the clipboard and instructions to run it. */
export const clickFix: Rule = (e) => {
  if (!e.dom?.clickFix) return null;
  return sig({
    id: 'clickfix_command',
    title: 'Tried to make you run a command',
    detail: 'This page copied a command to your clipboard and is telling you to paste it into Run or Terminal. That command installs malware. Pagida replaced it with a warning, so pasting it now does nothing.',
    tier: 'dom',
    weight: 70,
    certainty: 'correlated',
  });
};

/** Fake virus warning with a number to call. */
export const techSupportScam: Rule = (e) => {
  if (!e.dom?.techSupportScam || trustedName(reg(e.hostname))) return null;
  return sig({
    id: 'fake_virus_warning',
    title: 'Fake virus warning with a phone number',
    detail: 'This page says your computer is infected and gives a number to call. Real security warnings never do that. The person on the phone will ask for remote access or payment.',
    tier: 'dom',
    weight: 45,
  });
};

/** A fake pop-up window drawn inside the page, showing a brand's sign-in address. */
export const browserInBrowser: Rule = (e) => {
  const host = e.dom?.fakeAddressBar;
  if (!host || trustedName(reg(e.hostname))) return null;
  return sig({
    id: 'fake_popup_window',
    title: `Fake ${host} window`,
    detail: `This page draws a pretend browser window that shows "${host}" as its address. It is part of the page, not a real window, so the address in it proves nothing.`,
    tier: 'dom',
    weight: 40,
  });
};

/** "View this secure document" with a brand's name, off the brand's domain. */
export const documentLure: Rule = (e) => {
  if (!e.dom?.documentLure || trustedName(reg(e.hostname))) return null;
  const c = falseClaims(e)[0];
  if (!c) return null;
  const b = brandName(c.brand);
  return sig({
    id: 'document_lure',
    title: `"Shared document" page dressed as ${b}`,
    detail: `This page invites you to open a document or install a reader, using ${b}'s name, on a site ${b} does not own. Fake document pages are the first step of most credential theft.`,
    tier: 'dom',
    weight: 14,
  });
};

/** Crypto giveaway or airdrop wording. */
export const cryptoLure: Rule = (e) => {
  if (!e.dom?.cryptoLure || trustedName(reg(e.hostname))) return null;
  return sig({
    id: 'crypto_giveaway',
    title: 'Crypto giveaway or airdrop',
    detail: 'This page offers free crypto or asks you to connect a wallet to claim a reward. These pages drain the wallet that connects.',
    tier: 'dom',
    weight: 12,
  });
};

export const OFFLINE_RULES: Rule[] = [
  copiedSignInPage,
  borrowedLogo,
  borrowedAssets,
  seedPhraseRequest,
  dataToStranger,
  clickFix,
  techSupportScam,
  browserInBrowser,
  documentLure,
  cryptoLure,
];
