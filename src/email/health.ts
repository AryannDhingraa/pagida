/**
 * Can Pagida still read this mailbox?
 *
 * Gmail and Outlook do not publish how their pages are built, and they change
 * them without notice. When that happens the reader in `content/mail/adapters`
 * finds no messages, nothing is checked and no card ever appears, which looks
 * exactly like "every email was fine". This file is the part that tells those
 * two apart, so the popup can say "I cannot read emails here right now"
 * instead of staying quiet.
 *
 * Pure on purpose: the content script collects the facts, this decides.
 */

export interface ReaderFacts {
  client: 'gmail' | 'outlook';
  /**
   * The address bar says one email is open. Gmail: a thread id at the end of
   * the hash. Outlook: `/id/` in the path. False in Gmail's split-pane view
   * even with an email open, because the address does not change there.
   */
  urlSaysOpen: boolean;
  /**
   * Message blocks found by the long-lived markers (Gmail's data-message-id,
   * Outlook's "Message body" label), before any sender or subject is read.
   */
  bodiesSeen: number;
  /** Messages read in full: a body and its sender were both found. */
  messagesRead: number;
  /** Milliseconds since the address bar last changed. Emails take a moment to load. */
  msSinceNavigation: number;
}

/**
 * idle     no email is open, nothing to read
 * loading  an email seems to be opening, too early to judge
 * ok       at least one open email was read
 * blind    an email is open and Pagida cannot read it
 */
export type ReaderState = 'idle' | 'loading' | 'ok' | 'blind';

/** How long an opening email gets before "nothing read" counts as a failure. */
export const SETTLE_MS = 4000;

export function readerState(facts: ReaderFacts): ReaderState {
  const { urlSaysOpen, bodiesSeen, messagesRead, msSinceNavigation } = facts;
  if (messagesRead > 0) return 'ok';
  if (bodiesSeen === 0 && !urlSaysOpen) return 'idle';
  // A message block on screen that cannot be read is the clearest sign the
  // layout moved. It gets the normal settling time.
  if (bodiesSeen > 0) return msSinceNavigation < SETTLE_MS ? 'loading' : 'blind';
  // Only the address bar says an email is open. That is the case when a
  // redesign has removed every marker, but it is weaker evidence (a slow
  // connection looks the same for a while), so it waits twice as long.
  return msSinceNavigation < SETTLE_MS * 2 ? 'loading' : 'blind';
}
