/**
 * Detection for IDN homograph attacks — domains that render as a familiar brand
 * but are made of characters from a different alphabet.
 *
 * `аpple.com` with a Cyrillic а is a different domain to `apple.com` but is
 * pixel-identical in most fonts. Chrome protects against some of these, but not
 * all, and never against mixed-script names that don't hit its heuristics.
 */

/** Characters that are visually confusable with an ASCII letter or digit. */
const CONFUSABLES: Record<string, string> = {
  // Cyrillic lookalikes
  '\u0430': 'a', '\u0432': 'b', '\u0441': 'c', '\u0501': 'd', '\u0435': 'e',
  '\u0455': 's', '\u0456': 'i', '\u0458': 'j', '\u043A': 'k', '\u043C': 'm',
  '\u043D': 'h', '\u043E': 'o', '\u0440': 'p', '\u0442': 't', '\u0443': 'y',
  '\u0445': 'x', '\u0475': 'v', '\u051B': 'q', '\u051D': 'w', '\u0473': 'o',
  // Greek lookalikes
  '\u03B1': 'a', '\u03B2': 'b', '\u03B5': 'e', '\u03B9': 'i', '\u03BA': 'k',
  '\u03BD': 'v', '\u03BF': 'o', '\u03C1': 'p', '\u03C4': 't', '\u03C5': 'u',
  '\u03C7': 'x', '\u03F2': 'c',
  // Latin lookalikes that survive NFKC
  '\u2113': 'l', '\u01C0': 'l', '\u0131': 'i', '\u0237': 'j',
  // Plain-ASCII digit substitutions used in typosquats (g00gle, paypa1)
  '0': 'o', '1': 'l', '3': 'e', '4': 'a', '5': 's', '7': 't',
};

const SCRIPT_RANGES: Array<[string, RegExp]> = [
  ['latin', /[a-zA-Z]/],
  ['cyrillic', /[Ѐ-ӿ]/],
  ['greek', /[Ͱ-Ͽ]/],
  ['armenian', /[԰-֏]/],
  ['hebrew', /[֐-׿]/],
  ['arabic', /[؀-ۿ]/],
  ['han', /[一-鿿]/],
];

/** True when the label is punycode-encoded (`xn--...`). */
export function isPunycode(label: string): boolean {
  return label.toLowerCase().startsWith('xn--');
}

/** Every Unicode script present in the string, by our coarse ranges. */
export function scriptsIn(s: string): string[] {
  return SCRIPT_RANGES.filter(([, re]) => re.test(s)).map(([name]) => name);
}

/**
 * True when a single label mixes alphabets — the classic homograph tell.
 * A domain that is entirely Cyrillic is legitimate; one that is Latin with two
 * Cyrillic characters hidden in it is not.
 */
export function isMixedScript(hostname: string): boolean {
  return hostname
    .split('.')
    .some((label) => scriptsIn(label).length > 1);
}

/**
 * Fold confusable characters down to their ASCII lookalike so that
 * `pаypal` (Cyrillic а) and `paypa1` both normalise to `paypal`.
 */
export function skeleton(s: string): string {
  let out = '';
  for (const ch of s.toLowerCase().normalize('NFKC')) {
    out += CONFUSABLES[ch] ?? ch;
  }
  return out;
}

/** True when folding confusables changes the string — i.e. it contained some. */
export function hasConfusables(s: string): boolean {
  return skeleton(s) !== s.toLowerCase().normalize('NFKC');
}
