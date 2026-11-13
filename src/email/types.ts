/**
 * What the webmail adapters read off an open email, and what the email
 * engine says about it.
 *
 * The adapters (src/content/mail) fill `EmailEvidence` from the page. The
 * engine (src/email/evaluate.ts) is pure, so the same code runs in the
 * extension, in the tests and in the evaluation scripts.
 */
import type { DmarcPolicy } from '../core/dmarc.js';
import type { Band, Conclusion, Signal } from '../core/types.js';

export interface EmailLink {
  /** Where it really goes, after unwrapping Gmail and Outlook redirect wrappers. */
  href: string;
  /** What the reader sees: the link text. */
  text: string;
}

export interface EmailEvidence {
  /** Which webmail it came from. */
  client: 'gmail' | 'outlook' | 'test';
  /** Display name, e.g. "CommBank". */
  fromName: string;
  /** Address, e.g. "alerts@commbank-secure.ru". */
  fromAddress: string;
  replyTo?: string;
  /** The reader's own address, when the webmail shows it. */
  toAddress?: string;
  subject: string;
  /** Readable body text, cut to 20,000 characters. */
  bodyText: string;
  links: EmailLink[];
  /** Attachment file names. */
  attachments: string[];
  /** URLs found in QR codes inside the email (decoded by the worker). */
  qrUrls?: string[];
  /**
   * Days since registration, by registrable domain (sender and links), when
   * the worker could look it up. null: the registry publishes no date.
   */
  domainAges?: Record<string, number | null>;
  /** Trained text model's probability of phishing, from the content script. */
  textModelScore?: number | null;
  /** The reader's organisation's own domains, when set by company policy. */
  orgDomains?: string[];
  /** The sender domain's DMARC policy, when Pagida knows it (bundled for brands, looked up for your own organisation). */
  senderDmarc?: DmarcPolicy;
}

/** One link's local verdict, filled in by the worker before evaluation. */
export interface LinkFinding {
  href: string;
  band: Band;
  /** Short reason from the web engine, when the link is not clean. */
  reason?: string;
  /** On a local blocklist or confirmed list. */
  listed: boolean;
}

export interface EmailVerdict {
  band: Band;
  score: number;
  signals: Signal[];
  conclusions: Conclusion[];
  /** The registrable domain the email was sent from. */
  senderDomain: string;
  /**
   * Links that ask before they open: flagged by the web engine or a list, the
   * real target of a disguised link, and, in an email that pretends to be a
   * brand, every link that does not go to a well-known site.
   */
  riskyLinks: LinkFinding[];
  evaluatedAt: number;
}
