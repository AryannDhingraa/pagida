/**
 * Build script.
 *
 * Deliberately esbuild rather than a framework plugin: an extension has four
 * independent entry points with different output formats, and a 60-line script
 * that does exactly that is easier to reason about, and far less likely to
 * break on a dependency bump, than a plugin chain.
 *
 *   node scripts/build.mjs           one-shot build into dist/
 *   node scripts/build.mjs --watch   rebuild on change
 *   TARGET=firefox node scripts/build.mjs   Firefox build into dist-firefox/
 *
 * Chrome and Edge take the same package. Firefox takes the same code with a
 * slightly different manifest: background scripts instead of a service worker,
 * and an add-on id.
 */
import { build, context } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.env.TARGET === 'firefox' ? 'firefox' : 'chrome';
const outdir = resolve(root, process.env.OUTDIR || (target === 'firefox' ? 'dist-firefox' : 'dist'));
const watch = process.argv.includes('--watch');

const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));

/** Service worker and content script are separate bundles with different formats. */
const bundles = [
  { in: 'src/background/index.ts', out: 'background', format: 'esm' },
  { in: 'src/content/page/index.ts', out: 'content', format: 'iife' },
  { in: 'src/content/page/clipboard-main.ts', out: 'clipboard', format: 'iife' },
  { in: 'src/content/mail/index.ts', out: 'mail', format: 'iife' },
  { in: 'src/popup/popup.ts', out: 'popup', format: 'iife' },
  { in: 'src/options/options.ts', out: 'options', format: 'iife' },
  { in: 'src/report/report.ts', out: 'report', format: 'iife' },
];

const common = {
  bundle: true,
  target: target === 'firefox' ? ['firefox128'] : ['chrome116'],
  platform: 'browser',
  legalComments: 'none',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  define: { __PAGIDA_VERSION__: JSON.stringify(pkg.version) },
};

async function copyStatic() {
  await mkdir(outdir, { recursive: true });

  // Manifest, with the version kept in step with package.json automatically.
  const manifest = JSON.parse(await readFile(resolve(root, 'src/manifest.json'), 'utf8'));
  manifest.version = pkg.version;
  if (target === 'firefox') {
    // Firefox runs MV3 background code as an event page, not a service worker.
    manifest.background = { scripts: ['background.js'], type: 'module' };
    delete manifest.minimum_chrome_version;
    // Firefox takes organisation policy from policies.json, not a schema file.
    delete manifest.storage;
    // 128 is the first Firefox that runs content scripts in the page's own
    // world, which the ClickFix guard needs.
    manifest.browser_specific_settings = { gecko: { id: 'pagida@aryandhingra.dev', strict_min_version: '128.0' } };
  }
  await writeFile(resolve(outdir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  await cp(resolve(root, 'public/icons'), resolve(outdir, 'icons'), { recursive: true });
  await cp(resolve(root, 'src/managed-schema.json'), resolve(outdir, 'managed-schema.json'));

  for (const page of ['popup', 'options', 'report']) {
    await cp(resolve(root, `src/${page}/index.html`), resolve(outdir, `${page}.html`));
    await cp(resolve(root, `src/${page}/${page}.css`), resolve(outdir, `${page}.css`));
  }
  await cp(resolve(root, 'src/shared/theme.css'), resolve(outdir, 'theme.css'));
}

if (watch) {
  await rm(outdir, { recursive: true, force: true });
  await copyStatic();
  for (const b of bundles) {
    const ctx = await context({
      ...common,
      entryPoints: [resolve(root, b.in)],
      outfile: resolve(outdir, `${b.out}.js`),
      format: b.format,
    });
    await ctx.watch();
  }
  console.warn('pagida: watching for changes, load dist/ as an unpacked extension');
} else {
  await rm(outdir, { recursive: true, force: true });
  await copyStatic();
  await Promise.all(
    bundles.map((b) =>
      build({
        ...common,
        entryPoints: [resolve(root, b.in)],
        outfile: resolve(outdir, `${b.out}.js`),
        format: b.format,
      }),
    ),
  );
  console.warn(`pagida ${pkg.version}: built for ${target} to ${relative(root, outdir) || '.'}/`);
}
