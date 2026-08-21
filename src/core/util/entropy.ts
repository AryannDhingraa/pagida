/**
 * "Does this domain label look like a person chose it, or like a script did?"
 *
 * Modern phishing leans on free hosting and disposable domains, where the label
 * is generated rather than named: `e5o6x7os.pages.dev`, `8acd0e.example.cl`,
 * `dohtshi6.pages.dev`. None of those trip a brand-similarity check, because
 * they are not pretending to be a brand at all — the deception happens on the
 * page, and the address is just throwaway infrastructure.
 *
 * This is heuristic and it is meant to be. It carries a low weight and exists to
 * stack with other signals, not to convict on its own.
 */

/** Hex-looking blobs: `8acd0e`, `1f4b2c9d`. */
const HEX_BLOB = /^[0-9a-f]{6,}$/;
/** Letters and digits alternating three or more times: `e5o6x7os`. */
const ALTERNATING = /(?:[a-z]\d|\d[a-z]){3,}/;

export interface RandomnessVerdict {
  random: boolean;
  /** Which check tripped, for the explanation shown to the user. */
  reason: string;
}

export function looksGenerated(rawLabel: string): RandomnessVerdict {
  const label = rawLabel.toLowerCase();
  const s = label.replace(/-/g, '');
  if (s.length < 6) return { random: false, reason: '' };

  if (HEX_BLOB.test(s) && /\d/.test(s)) {
    return { random: true, reason: 'it is a string of hex characters' };
  }
  if (ALTERNATING.test(s)) {
    return { random: true, reason: 'letters and digits alternate through it' };
  }

  const vowels = (s.match(/[aeiouy]/g) ?? []).length;
  const digits = (s.match(/\d/g) ?? []).length;
  const vowelRatio = vowels / s.length;
  const longestConsonantRun = Math.max(
    ...s.split(/[aeiouy0-9]/).map((chunk) => chunk.length),
    0,
  );

  if (s.length >= 7 && vowelRatio < 0.2) {
    return { random: true, reason: 'it has almost no vowels' };
  }
  if (s.length >= 7 && longestConsonantRun >= 5) {
    return { random: true, reason: `it contains ${longestConsonantRun} consonants in a row` };
  }
  // Four digits, not three: `office365` and `bet365` are real names with a
  // number in them, and three digits is not enough to call a label generated.
  if (digits >= 4 && s.length <= 14 && vowelRatio < 0.35) {
    return { random: true, reason: 'it is mostly digits' };
  }

  return { random: false, reason: '' };
}

/**
 * Hosts where every subdomain belongs to a different, usually anonymous, person.
 * Free, instant, and disposable — which is why phishing kits live on them.
 */
export const FREE_HOSTING_SUFFIXES: ReadonlySet<string> = new Set([
  'pages.dev', 'workers.dev', 'r2.dev', 'trycloudflare.com',
  'netlify.app', 'vercel.app', 'web.app', 'firebaseapp.com',
  'repl.co', 'replit.dev', 'glitch.me', 'herokuapp.com',
  'ngrok.io', 'ngrok-free.app', 'serveo.net', 'duckdns.org',
  'weebly.com', 'wixsite.com', 'square.site', 'myshopify.com',
  'blogspot.com', 'github.io', 'gitlab.io', 'azurewebsites.net',
  'edgeone.dev', 'edgeone.app', 'pages.gitlab.io', 'surge.sh', 'onrender.com',
  'fly.dev', 'railway.app', 'up.railway.app', 'codeanyapp.com',
  '000webhostapp.com', 'infinityfreeapp.com', 'epizy.com', 'rf.gd', 'ct.ws',
  'kesug.com', 'byethost.com', 'freewebhostmost.com', 'criarsite.online',
  'my.id', 'ivv.my.id', 'wuaze.com', 'wordpress.com', 'blogspot.com.au',
  'framer.website', 'webflow.io', 'notion.site', 'super.site', 'carrd.co',
  'bubbleapps.io', 'softr.app', 'durable.co', 'godaddysites.com',
]);
