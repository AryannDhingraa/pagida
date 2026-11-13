/**
 * Runs the email engine over labelled email sets and prints how often it
 * warns. Inputs are JSONL files from scripts/email-corpus.py.
 *
 *   PHISH=phish.jsonl HAM=easy.jsonl,hard.jsonl node scripts/run-ts.mjs scripts/evaluate-email.ts
 *
 * Link checks here are address-only, the same as in the extension before the
 * blocklists are consulted, so the numbers are what Pagida does offline with
 * empty lists. QR codes are not decoded (the corpora carry no images).
 */
import { readFileSync } from 'node:fs';
import { checkLink, evaluateEmail } from '../src/email/evaluate.js';
import { score } from '../src/learned/textModel.js';
import { EMAIL_MODEL } from '../src/learned/data/emailModel.js';
import type { EmailEvidence } from '../src/email/types.js';

interface Tally { n: number; warned: number; danger: number; reasons: Map<string, number> }

function run(file: string, keepExamples = 0): Tally {
  const t: Tally = { n: 0, warned: 0, danger: 0, reasons: new Map() };
  const examples: string[] = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const e = JSON.parse(line) as EmailEvidence;
    e.textModelScore = score(EMAIL_MODEL, `${e.subject}\n\n${e.bodyText}`);
    const v = evaluateEmail(e, [...new Set(e.links.map((l) => l.href))].slice(0, 40).map(checkLink));
    t.n++;
    if (v.conclusions.length > 0) {
      t.warned++;
      if (v.band === 'danger') t.danger++;
      const top = v.conclusions[0]!.id;
      t.reasons.set(top, (t.reasons.get(top) ?? 0) + 1);
      if (examples.length < keepExamples) examples.push(`   ${v.band.padEnd(10)} ${top.padEnd(20)} ${e.fromName} <${e.fromAddress}> | ${e.subject.slice(0, 60)}`);
    }
  }
  for (const x of examples) console.log(x);
  return t;
}

const pct = (a: number, n: number) => `${((100 * a) / Math.max(1, n)).toFixed(1)}%`;
function report(label: string, t: Tally): void {
  const reasons = [...t.reasons.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
  console.log(`${label.padEnd(28)} ${String(t.n).padStart(5)}  warned ${pct(t.warned, t.n).padStart(6)}  danger ${pct(t.danger, t.n).padStart(6)}  | ${reasons}`);
}

for (const f of (process.env.PHISH ?? '').split(',').filter(Boolean)) report(`phishing ${f.split('/').pop()}`, run(f));
for (const f of (process.env.HAM ?? '').split(',').filter(Boolean)) report(`legit ${f.split('/').pop()}`, run(f, Number(process.env.SHOW ?? 0)));
