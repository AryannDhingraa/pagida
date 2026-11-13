/**
 * The one tokenizer both trained models use, in the extension and in
 * training. `scripts/train-text-models.py` implements exactly the same steps;
 * `test/learned.test.ts` pins both to the same expected output, so a change to
 * one without the other fails the build instead of silently skewing scores.
 *
 *  1. Lower-case. Web addresses become `urltoken`, email addresses `emailtoken`,
 *     runs of digits `numtoken`.
 *  2. Split on anything that is not a letter.
 *  3. Keep words of 2 to 24 letters, then add each adjacent pair as a bigram.
 *  4. Hash every term with 32-bit FNV-1a into 2^18 buckets.
 */
export const DIMS = 1 << 18;

const URL_RE = /(?:https?:\/\/|www\.)\S+/g;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g;
const NUM_RE = /\d+/g;

export function terms(text: string, maxChars = 20_000): string[] {
  const t = text.slice(0, maxChars).toLowerCase()
    .replace(URL_RE, ' urltoken ')
    .replace(EMAIL_RE, ' emailtoken ')
    .replace(NUM_RE, ' numtoken ');
  const words = t.split(/[^a-z]+/).filter((w) => w.length >= 2 && w.length <= 24);
  const out = [...words];
  for (let i = 0; i + 1 < words.length; i++) out.push(`${words[i]}_${words[i + 1]}`);
  return out;
}

/** 32-bit FNV-1a over UTF-16 code units (all terms are ASCII after step 2). */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h >>> 0;
}

/** The set of hashed buckets present in the text (presence, not counts). */
export function buckets(text: string): Set<number> {
  const out = new Set<number>();
  for (const term of terms(text)) out.add(fnv1a(term) % DIMS);
  return out;
}
