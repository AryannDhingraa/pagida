/**
 * Core type definitions for the Pagida detection engine.
 *
 * Everything in `src/core` is deliberately free of browser APIs so that the
 * exact same code that runs in the extension can be imported by the Node
 * evaluation harness in `scripts/evaluate.ts`. If you ever find yourself
 * reaching for `chrome.*` or `document` in here, the rule belongs somewhere else.
 */

/** Which layer of analysis produced a signal. */
export type Tier = 'url' | 'dom' | 'reputation' | 'user';

/** Risk bands, in ascending order of concern. */
export type Band = 'clean' | 'caution' | 'suspicious' | 'danger';

/** A single detection rule that fired, with the evidence that made it fire. */
export interface Signal {
  /** Stable machine-readable id, e.g. `domain_age_lt_30d`. Never change these. */
  id: string;
  /** Short human title shown in the popup. */
  title: string;
  /** One plain-English sentence naming the actual evidence. */
  detail: string;
  tier: Tier;
  /** Points added to the risk score. Negative weights are allowed. */
  weight: number;
}

/**
 * Everything the engine knows about a page. The URL fields are always present;
 * DOM fields are only populated when a content script ran, and reputation
 * fields only when the relevant lookup was enabled and succeeded.
 */
export interface PageEvidence {
  // --- always available (derived from the URL alone) ---
  url: string;
  protocol: string;
  hostname: string;
  /** eTLD+1, e.g. `paypal.com` for `login.paypal.com`. */
  registrableDomain: string;
  /** Labels in front of the registrable domain, outermost last. */
  subdomains: string[];
  path: string;
  query: string;
  /** True when the URL carries `user:pass@` or a bare `@`. */
  hasEmbeddedCredentials: boolean;

  // --- DOM tier (undefined when no content script ran) ---
  dom?: DomEvidence;

  // --- reputation tier (undefined when the lookup was off or failed) ---
  /** Age of the registrable domain in days, or null when RDAP had no answer. */
  domainAgeDays?: number | null;
  /** Exact URL present in a phishing feed. */
  feedUrlHit?: boolean;
  /** Hostname present in a phishing feed (broader, slightly noisier). */
  feedHostHit?: boolean;
  /** Google Safe Browsing returned a threat match. */
  safeBrowsingHit?: boolean;
  /** Google Web Risk, reached through the Pagida service. */
  webRiskHit?: boolean;
  /** What Web Risk called it: MALWARE, SOCIAL_ENGINEERING, UNWANTED_SOFTWARE. */
  webRiskThreats?: string[];

  // --- user tier ---
  /** The user explicitly reported this host as phishing. */
  userReported?: boolean;
  /** The user explicitly marked this host as safe. */
  userTrusted?: boolean;
}

/** Signals extracted from the live page by the content script. */
export interface DomEvidence {
  title: string;
  hasPasswordField: boolean;
  /** Absolute URLs that forms containing a password field submit to. */
  passwordFormActions: string[];
  /** True when a password form posts to a different registrable domain. */
  crossOriginPasswordForm: boolean;
  /** True when an https page posts a password form over plain http. */
  insecurePasswordFormAction: boolean;
  /** Iframes that are hidden, zero-sized or positioned off-screen. */
  hiddenIframeCount: number;
  /** Brand names detected in the title, headings, alt text or meta description. */
  brandTokens: string[];
  /** Favicon is served from a different registrable domain than the page. */
  externalFavicon: boolean;
  /** Where the favicon actually came from, so the rule can judge whose it is. */
  faviconHost?: string;
  /** Page blocks paste on a password field via an inline handler. */
  pasteBlocked: boolean;
  /** Page blocks the right-click menu via an inline handler. */
  contextMenuBlocked: boolean;
  /** 0..1 density of obfuscation markers in inline scripts. */
  obfuscationScore: number;
  /** Count of anchors on the page. */
  linkCount: number;
  /** Proportion of anchors that are dead (`#`, `javascript:void(0)` or empty). */
  deadLinkRatio: number;
}

/** The engine's answer for one page. */
export interface Verdict {
  url: string;
  hostname: string;
  score: number;
  band: Band;
  signals: Signal[];
  /** True when only URL-tier signals were available (no content script). */
  urlOnly: boolean;
  /** Set when a user override decided the verdict, bypassing the score. */
  override?: 'reported' | 'trusted';
  evaluatedAt: number;
}

/** A rule takes evidence and either fires (returning a Signal) or doesn't. */
export type Rule = (e: PageEvidence) => Signal | null;
