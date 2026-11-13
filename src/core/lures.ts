/**
 * Lures: pages that steal without a login form.
 *
 * Chrome's own on-device classifier was found never to flag phishing pages
 * that do not show a login form immediately (ASIACCS 2024). Those are now the
 * commonest attacks: fake CAPTCHAs that put a command on your clipboard
 * (ClickFix, more than half of Push Security's browser detections in 2026),
 * fake virus warnings with a phone number, fake "view this document" pages,
 * and crypto pages that ask for a recovery phrase.
 *
 * Pure text logic, so it is unit tested in Node exactly as it runs in the page.
 */

/**
 * A command that runs code. Generous on purpose: what matters is the
 * combination with run-it instructions, which `isClickFix` requires.
 */
const COMMAND = new RegExp([
  String.raw`\bpowershell\b`, String.raw`\bpwsh\b`, String.raw`\bmshta\b`, String.raw`\bcmd(?:\.exe)?\s*/[ck]\b`,
  String.raw`\brundll32\b`, String.raw`\bregsvr32\b`, String.raw`\bcertutil\b`, String.raw`\bbitsadmin\b`,
  String.raw`\bmsiexec\b`, String.raw`\bwscript\b`, String.raw`\bcscript\b`, String.raw`\bconhost\b`,
  String.raw`\bpcalua\b`, String.raw`\bfinger\b\s+\S+@`, String.raw`\biex\b`, String.raw`invoke-(?:expression|webrequest|restmethod)`,
  String.raw`frombase64string`, String.raw`\bosascript\b`, String.raw`\bbase64\s+(?:-d|--decode|-D)\b`,
  String.raw`\b(?:curl|wget)\b[^\n]{0,300}\|\s*(?:ba|z|da)?sh\b`, String.raw`\bstart-process\b`,
  String.raw`\b-enc(?:odedcommand)?\s+[A-Za-z0-9+/=]{16,}`, String.raw`\bnslookup\b[^\n]{0,80}\|`,
].join('|'), 'i');

/** Strongly malicious markers: no honest page copies these for you. */
const HOSTILE = /\bmshta\s+https?:|-w(?:indowstyle)?\s+h(?:idden)?\b|iex\s*\(\s*(?:iwr|irm|new-object)|frombase64string|\bpcalua\b|\bfinger\b\s+\S+@|-enc(?:odedcommand)?\s+[A-Za-z0-9+/=]{24,}/i;

export function looksLikeCommand(text: string): boolean {
  return COMMAND.test(normaliseCommand(text));
}

/** Undo the tricks kits use to slip past simple matching: carets, zero-width characters, odd spaces. */
export function normaliseCommand(text: string): string {
  return text
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\^(?=\S)/g, '')
    .replace(/[\u00A0\u2000-\u200A]/g, ' ')
    .slice(0, 4000);
}

export function looksHostile(text: string): boolean {
  return HOSTILE.test(normaliseCommand(text));
}

/** "Press Win+R", "open Terminal", "press Ctrl+V and Enter". */
const RUN_INSTRUCTIONS = /(?:win(?:dows)?\s*(?:key)?\s*\+\s*r\b|windows\s+key\s*(?:\+|and)\s*r\b|\brun\s+(?:dialog|box|window)\b|win\s*\+\s*x\b|open\s+(?:the\s+)?(?:terminal|powershell|command\s+prompt)|(?:press|hit)\s+ctrl\s*\+\s*v|(?:cmd|command)\s*\+\s*space|paste\s+(?:it\s+)?(?:in(?:to)?|and\s+press)\s+(?:the\s+)?(?:run|terminal|box|enter))/i;
const VERIFY_CONTEXT = /verify\s+(?:that\s+)?you\s+are\s+(?:a\s+)?human|i'?m\s+not\s+a\s+robot|human\s+verification|verification\s+steps|complete\s+(?:the\s+)?verification|captcha|cloudflare|security\s+check|fix\s+(?:the\s+)?(?:issue|error|problem)|update\s+required/i;

export function hasRunInstructions(text: string): boolean {
  return RUN_INSTRUCTIONS.test(text);
}

/**
 * ClickFix: a command was put on the clipboard AND the page tells the person
 * to run it. Either half alone is common on honest pages (developer docs copy
 * install commands; help pages explain Win+R). Both together is the attack.
 */
export function isClickFix(clipboard: string | undefined, pageText: string): boolean {
  if (!clipboard || !looksLikeCommand(clipboard)) return false;
  if (looksHostile(clipboard)) return true;
  return hasRunInstructions(pageText) && VERIFY_CONTEXT.test(pageText);
}

/** Fake virus warning with a number to call. */
const SCARE = /(?:virus|trojan|spyware|malware|pornographic|zeus|hacked|compromised)[^.]{0,80}(?:detected|infected|found|alert|warning)|(?:your\s+(?:computer|pc|device|mac|iphone)|windows|this\s+(?:pc|computer))[^.]{0,60}(?:has\s+been\s+)?(?:blocked|locked|infected|compromised)|do\s+not\s+(?:close|restart|shut\s*down|turn\s+off)\s+(?:this|your)/i;
const CALL = /(?:call|contact|dial|ring)\s+(?:microsoft|windows|apple|support|a\s+technician|technical|the\s+(?:helpline|support))|(?:toll[\s-]?free|support|helpline|technician)[^.]{0,40}(?:\+?\d[\d\s().-]{7,}\d)/i;
const PHONE = /\+?\d[\d\s().-]{7,}\d/;

export function isTechSupportScam(text: string): boolean {
  return SCARE.test(text) && CALL.test(text) && PHONE.test(text);
}

/** "You have received a secure document. Sign in to view." */
const DOCUMENT_LURE = /(?:view|open|access|download|review)\s+(?:the\s+|your\s+|shared\s+|secure(?:d)?\s+)*(?:document|file|pdf|invoice|attachment|fax|voicemail|statement)s?|(?:secure(?:d)?|encrypted|protected|shared)\s+(?:document|file|pdf|message)|(?:update|download|install)\s+(?:the\s+latest\s+)?(?:adobe|acrobat|pdf\s+reader|reader|browser|flash)|you\s+have\s+(?:received|been\s+sent)\s+(?:a|an|\d+)\s+(?:new\s+)?(?:document|file|fax|voicemail|message)/i;

export function isDocumentLure(text: string): boolean {
  return DOCUMENT_LURE.test(text);
}

/** Crypto: "enter your 12-word recovery phrase", "connect wallet to claim". */
const SEED_TEXT = /(?:recovery|seed|secret|mnemonic|backup|wallet)\s+(?:phrase|words)|(?:12|24|twelve|twenty[\s-]four)[\s-]word|private\s+key/i;
const CLAIM_TEXT = /(?:claim|airdrop|giveaway|double\s+your|bonus)[^.]{0,60}(?:token|crypto|btc|eth|usdt|coin|nft|reward)|connect\s+(?:your\s+)?wallet[^.]{0,60}(?:claim|airdrop|reward|eligib)/i;

export function mentionsSeedPhrase(text: string): boolean {
  return SEED_TEXT.test(text);
}

export function isCryptoClaimLure(text: string): boolean {
  return CLAIM_TEXT.test(text);
}

/**
 * Where kits send what they steal. A sign-in form whose data goes to a
 * Telegram bot or a free form-relay service is not a sign-in form.
 */
const EXFIL: Array<[RegExp, string]> = [
  [/api\.telegram\.org\/bot/i, 'a Telegram bot'],
  [/discord(?:app)?\.com\/api\/webhooks/i, 'a Discord webhook'],
  [/formspree\.io|getform\.io|formsubmit\.co|submit-form\.com|formcarry\.com|usebasin\.com|formbold\.com|getbasin|form\.taxi/i, 'a free form-relay service'],
  [/sheetdb\.io|sheet\.best|sheetmonkey|script\.google\.com\/macros\/s\//i, 'a spreadsheet'],
  [/webhook\.site|pipedream\.net|requestbin|hookbin|beeceptor\.com|ngrok(?:-free)?\.(?:io|app)/i, 'a temporary webhook'],
  [/api\.emailjs\.com|smtpjs\.com/i, 'an email-sending script'],
];

export function exfilTarget(text: string): string | null {
  for (const [re, what] of EXFIL) if (re.test(text)) return what;
  return null;
}

/** The two that are almost never on an honest page, even without a form. */
export function isBotExfil(text: string): boolean {
  return /api\.telegram\.org\/bot\d+:|discord(?:app)?\.com\/api\/webhooks\/\d+/i.test(text);
}
