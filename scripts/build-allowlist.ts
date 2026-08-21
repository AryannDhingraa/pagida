/**
 * Generates `src/core/data/allowlist.ts` from a public top-sites ranking.
 *
 * Why an allowlist exists at all: `telegraph.co.uk` is two edits from
 * `telegram`, and several real news and medical sites sit close to brand names.
 * Suppressing the lookalike rules for domains that are themselves well known
 * removes an entire class of false positive that no amount of weight tuning
 * can fix.
 *
 * Only the top 1,000 are bundled — enough to cover the sites people actually
 * confuse, small enough that the file stays a few kilobytes, and the evaluation
 * harness deliberately draws its negatives from further down the same ranking
 * so the two sets never overlap.
 *
 * Run: npm run build:allowlist
 */
import { writeFile } from 'node:fs/promises';
import { parseHost } from '../src/core/util/domain.js';

const SOURCE = 'https://raw.githubusercontent.com/zer0h/top-1000000-domains/master/top-10000-domains';
const SIZE = 2000;

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`could not fetch top sites: HTTP ${res.status}`);

const domains = (await res.text())
  .split('\n')
  .map((l) => l.trim().toLowerCase())
  .filter(Boolean)
  .slice(0, SIZE)
  .map((d) => parseHost(d).registrableDomain);

const unique = [...new Set(domains)].sort();

const header = [
  '/**',
  ' * Well-known domains, generated — do not edit by hand.',
  ' *',
  ` * Source: top-sites ranking, top ${SIZE} entries, reduced to registrable domains.`,
  ' * Regenerate with `npm run build:allowlist`.',
  ' *',
  ' * These domains are exempt from the lookalike rules (typosquat, confusable',
  ' * characters, generated-label, trust-words). They are not exempt from anything',
  ' * that describes behaviour — a well-known domain that has been compromised and',
  ' * is serving a credential form still scores on the page-content tier.',
  ' */',
].join('\n');

const body = [
  'export const WELL_KNOWN_DOMAINS: ReadonlySet<string> = new Set([',
  ...unique.map((d) => `  '${d}',`),
  ']);',
  '',
  "/** True when a registrable domain is one of the world's best-known sites. */",
  'export function isWellKnown(registrableDomain: string): boolean {',
  '  return WELL_KNOWN_DOMAINS.has(registrableDomain);',
  '}',
  '',
  `export const ALLOWLIST_SIZE = ${unique.length};`,
  `export const ALLOWLIST_SOURCE_RANK_LIMIT = ${SIZE};`,
  '',
].join('\n');

await writeFile('src/core/data/allowlist.ts', `${header}\n${body}`);
console.log(`wrote src/core/data/allowlist.ts with ${unique.length} domains`);
