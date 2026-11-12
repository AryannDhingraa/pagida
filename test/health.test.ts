import { describe, expect, it } from 'vitest';
import { readerState, SETTLE_MS, type ReaderFacts } from '../src/email/health.js';

const base: ReaderFacts = { client: 'gmail', urlSaysOpen: false, bodiesSeen: 0, messagesRead: 0, msSinceNavigation: 60_000 };
const at = (over: Partial<ReaderFacts>) => readerState({ ...base, ...over });

describe('can Pagida still read this mailbox', () => {
  it('is ok whenever an email was read', () => {
    expect(at({ messagesRead: 1, bodiesSeen: 1, urlSaysOpen: true })).toBe('ok');
    expect(at({ messagesRead: 2, bodiesSeen: 2, msSinceNavigation: 0 })).toBe('ok');
  });

  it('is idle in the inbox list, the normal case', () => {
    expect(at({})).toBe('idle');
    expect(at({ client: 'outlook' })).toBe('idle');
  });

  // Attack-and-twin pairs: each blind case next to the slow load it could be confused with.
  it('is blind when a message block is on screen and nothing in it could be read', () => {
    expect(at({ bodiesSeen: 1 })).toBe('blind');
  });
  it('waits while that message block is still loading', () => {
    expect(at({ bodiesSeen: 1, msSinceNavigation: SETTLE_MS - 1 })).toBe('loading');
  });

  it('is blind when only the address says an email is open, after a longer wait', () => {
    expect(at({ urlSaysOpen: true, msSinceNavigation: SETTLE_MS * 2 })).toBe('blind');
  });
  it('does not call a slow connection blind', () => {
    expect(at({ urlSaysOpen: true, msSinceNavigation: SETTLE_MS + 500 })).toBe('loading');
  });

  it('judges split-pane view (no id in the address) by the message block alone', () => {
    expect(at({ urlSaysOpen: false, bodiesSeen: 1 })).toBe('blind');
    expect(at({ urlSaysOpen: false, bodiesSeen: 0 })).toBe('idle');
  });
});

import { parseDmarc, forgeable } from '../src/core/dmarc.js';
describe('reading a DMARC record', () => {
  it('reads the policy', () => {
    expect(parseDmarc(['"v=DMARC1; p=reject; rua=mailto:d@x.com"'])).toBe('reject');
    expect(parseDmarc(['"v=DMARC1;p=quarantine;pct=100"'])).toBe('quarantine');
    expect(parseDmarc(['"v=DMARC1; p=none"'])).toBe('none');
  });
  it('joins records split into quoted chunks', () => {
    expect(parseDmarc(['"v=DMARC1; p=re" "ject"'])).toBe('reject');
  });
  it('treats no record, or a different record, as missing', () => {
    expect(parseDmarc([])).toBe('missing');
    expect(parseDmarc(['"v=spf1 include:_spf.google.com ~all"'])).toBe('missing');
  });
  it('only none and missing are forgeable', () => {
    expect(forgeable('none')).toBe(true);
    expect(forgeable('missing')).toBe(true);
    expect(forgeable('quarantine')).toBe(false);
    expect(forgeable(undefined)).toBe(false);
  });
});
