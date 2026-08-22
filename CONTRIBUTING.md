# Contributing

Contributions are very welcome, particularly **false-positive reports** — a
legitimate site that Pagida flags is more useful to me than almost any feature.

## Reporting a missed phishing page or a false positive

Open an issue with:

- The URL, defanged (`hxxps://evil[.]tk/login`)
- The score and the list of signals Pagida showed, straight from the popup
- What you expected instead

For false positives, the score breakdown is the important part — it tells me
exactly which rule misfired.

## Setting up

```bash
git clone https://github.com/AryannDhingraa/pagida.git
cd pagida
npm install
npm run dev
```

Then load `dist/` at `chrome://extensions` with Developer mode on. `npm run dev`
rebuilds on change; hit the reload button on the extension card to pick changes
up.

Requires Node 20 or newer.

## Before opening a pull request

```bash
npm run typecheck
npm run lint
npm test
```

CI runs all three plus a build and a package-size check.

## Adding a detection rule

Rules live in `src/core/rules/` and are pure functions: evidence in, `Signal`
or `null` out. To add one:

1. Write it in the file matching its tier (`url`, `dom`, `reputation`,
   `compound`) and export it.
2. Add it to that file's exported rule array.
3. Write a test that it fires on the case it targets **and** a test that it does
   not fire on a legitimate lookalike. The second test is the important one.
4. Run `npm run evaluate` before and after. If precision drops, the rule needs
   a tighter guard or a lower weight.

### What makes a good rule

- **The `detail` string must name the actual evidence.** "Suspicious domain" is
  useless; "registered 3 days ago" is not. Someone should be able to verify your
  claim by hand.
- **Weight it by how much it moves the answer alone.** Most rules belong in the
  8–20 range. Anything above 30 should be close to conclusive on its own.
- **Prefer a false negative to a false positive.** A warning people learn to
  ignore is worse than no warning.
- **No browser APIs in `src/core`.** That constraint is what lets the evaluation
  harness run the real engine. A rule that reaches for `chrome.*` or `document`
  belongs in the content script or a service instead.

## Adding a brand

`src/core/data/brands.ts`. One token, and every registrable domain that brand
legitimately serves from — including country variants, or you will create false
positives for real regional sites. Run `npm run evaluate` afterwards.

## Style

TypeScript, strict mode, ESLint and Prettier defaults. Conventional commits
(`feat:`, `fix:`, `docs:`, `test:`, `refactor:`). Comments explain *why*, not
what — the code already says what.
