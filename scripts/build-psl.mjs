/**
 * Compiles the Public Suffix List into src/core/data/psl.ts.
 *
 * WHY THIS IS GENERATED AND COMMITTED
 *
 * Pagida used to ship a hand-written list of about a hundred multi-part
 * suffixes with a "last two labels" fallback. That was a deliberate size
 * trade-off and it was the wrong one. Working out who actually owns a domain is
 * the foundation every other rule stands on: brand comparison, typosquat
 * distance, the allowlist, the "is this the brand's own site" guard on the
 * credential-theft conclusion. Getting it wrong on an unusual suffix does not
 * produce a slightly worse score, it produces a confident answer about the
 * wrong domain.
 *
 * So the real list ships. ~9,800 rules, ~130KB of text, which gzips to about
 * 35KB inside the package — a rounding error next to being right.
 *
 * The data comes from the `psl` devDependency rather than a network fetch, so
 * the build is reproducible offline and updating the list is `npm update psl`
 * followed by re-running this script. The output is committed so that a clean
 * checkout builds without this step.
 *
 *   node scripts/build-psl.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';

const SOURCE = 'node_modules/psl/data/rules.js';
const OUTPUT = 'src/core/data/psl.ts';

const source = await readFile(SOURCE, 'utf8');
const match = source.match(/\[[\s\S]*\]/);
if (!match) throw new Error(`could not find the rule array in ${SOURCE}`);

/** @type {string[]} */
const rules = JSON.parse(match[0]);

// The list has three kinds of rule and they are handled separately at lookup
// time, so split them here rather than making the runtime do string tests.
const exceptions = [];
const wildcards = [];
const plain = [];

for (const rule of rules) {
  if (rule.startsWith('!')) exceptions.push(rule.slice(1));
  else if (rule.startsWith('*.')) wildcards.push(rule.slice(2));
  else if (rule.includes('*')) wildcards.push(rule.replace(/^\*\./, ''));
  else plain.push(rule);
}

const list = (values) => JSON.stringify(values.sort().join('\n'));

const output = `/* eslint-disable */
/**
 * The Public Suffix List, compiled.
 *
 * GENERATED FILE — do not edit by hand.
 * Run \`npm run build:psl\` to regenerate from the \`psl\` devDependency.
 *
 * Stored as newline-joined strings rather than arrays because the parser is
 * about 40% smaller that way and the runtime splits them into Sets once, at
 * module load, which costs well under a millisecond.
 *
 * Rules: ${plain.length} plain, ${wildcards.length} wildcard, ${exceptions.length} exception.
 */

/** Ordinary suffixes: \`com\`, \`co.uk\`, \`github.io\`. */
export const PSL_RULES = ${list(plain)};

/** Wildcard suffixes: \`*.ck\` means every label under \`ck\` is a suffix. */
export const PSL_WILDCARDS = ${list(wildcards)};

/** Exceptions that punch a hole in a wildcard: \`!www.ck\` is registrable. */
export const PSL_EXCEPTIONS = ${list(exceptions)};
`;

await writeFile(OUTPUT, output);
console.log(
  `psl: ${plain.length} rules, ${wildcards.length} wildcards, ${exceptions.length} exceptions ` +
  `-> ${OUTPUT} (${(output.length / 1024).toFixed(0)}KB)`,
);
