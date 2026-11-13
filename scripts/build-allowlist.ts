/**
 * Generates `src/core/data/allowlist.ts` from the Tranco list.
 *
 * Why an allowlist exists at all: `telegraph.co.uk` is two edits from
 * `telegram`, and several real news and medical sites sit close to brand names.
 * Suppressing the lookalike rules for domains that are themselves well known
 * removes an entire class of false positive that no amount of weight tuning
 * can fix.
 *
 * v5 uses the current Tranco top 10,000. v3 shipped a 2017-era top 2,000 that
 * was missing figma.com, notion.so, atlassian.com, chatgpt.com and vercel.com.
 *
 * Tranco ships as a zip, so download and unzip it first:
 *   curl -L https://tranco-list.eu/top-1m.csv.zip -o top-1m.csv.zip && unzip top-1m.csv.zip
 *   npm run build:allowlist -- top-1m.csv
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseHost } from '../src/core/util/domain.js';

const SIZE = Number(process.env.SIZE ?? 10000);
const source = process.argv[process.argv.length - 1];
if (!source || !source.endsWith('.csv')) throw new Error('pass the path to Tranco top-1m.csv');

const rows = readFileSync(source, 'utf8').split(/\r?\n/).slice(0, SIZE);
const domains = [...new Set(rows
  .map((r) => r.split(',')[1])
  .filter((d): d is string => !!d)
  .map((d) => parseHost(d).registrableDomain)
  .filter((d) => d.includes('.')))].sort();

writeFileSync('src/core/data/allowlist.ts', `/**
 * Well-known domains, generated. Do not edit by hand.
 *
 * Source: Tranco list (tranco-list.eu), top ${SIZE} entries, reduced to registrable domains.
 * Regenerate with \`npm run build:allowlist -- top-1m.csv\`.
 */
export const WELL_KNOWN_DOMAINS: ReadonlySet<string> = new Set(${JSON.stringify(domains)});

/** True when a registrable domain is one of the world's best-known sites. */
export function isWellKnown(registrableDomain: string): boolean {
  return WELL_KNOWN_DOMAINS.has(registrableDomain);
}

export const ALLOWLIST_SIZE = ${domains.length};
export const ALLOWLIST_SOURCE_RANK_LIMIT = ${SIZE};
`);
console.log(`wrote src/core/data/allowlist.ts with ${domains.length} domains`);
