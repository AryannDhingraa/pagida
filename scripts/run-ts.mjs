/**
 * Runs a TypeScript script under plain Node by bundling it with esbuild first.
 *
 * Node can strip types natively, but it does not rewrite the `.js` extensions
 * that TypeScript's own module resolution requires, so a bundle step is the
 * simplest thing that works on every Node version the project supports.
 *
 *   node scripts/run-ts.mjs scripts/evaluate.ts
 */
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const entry = process.argv[2];
if (!entry) {
  console.error('usage: node scripts/run-ts.mjs <script.ts>');
  process.exit(1);
}

const dir = await mkdtemp(join(tmpdir(), 'pagida-'));
const outfile = join(dir, 'script.mjs');

try {
  await build({
    entryPoints: [resolve(entry)],
    outfile,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    packages: 'external',
    logLevel: 'error',
  });
  await import(pathToFileURL(outfile).href);
} finally {
  await rm(dir, { recursive: true, force: true });
}
