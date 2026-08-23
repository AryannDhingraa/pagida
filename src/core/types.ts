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

/**
 * How much a signal is actually worth as evidence.
 *
 * This distinction is the spine of the engine. A hyphenated hostname and an
 * exact match in a phishing blocklist are both "signals", but only one of them
 * is a fact. Collapsing them into a single number was the original design's
 * worst idea: it let ten cosmetic observations add up to the same verdict as
 * one positive identification, and it let a user's "mark as safe" silence both.
 *
 *  - `confirmed`  Someone competent has already identified this exact thing as
 *                 malicious. A blocklist hit, a Web Risk match. Not a judgement
 *                 call, and therefore never tuned by the sensitivity setting and
 *                 never suppressed by a user's trust mark.
 *  - `correlated` Several independent observations that only line up this way on
 *                 an attack. A sign-in form for a brand that does not own the
 *                 domain, posting credentials somewhere else again.
 *  - `heuristic`  A single suspicious-looking property. Cheap, evadable, and
 *                 only meaningful in aggregate. The default.
 */
export type Certainty = 'confirmed' | 'correlated' | 'heuristic';

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
  /** How much this is worth as evidence. Defaults to `heuristic`. */
  certainty?: Certainty;
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

/**
 * A named conclusion the engine reached, as opposed to a number it computed.
 *
 * Conclusions are the answer to the criticism that a weighted sum is not a
 * probability. `sum of weights >= 55` is not a claim about the world;
 * "this page impersonates a brand, asks for a password, and posts it to a
 * third party" is. When a conclusion fires it imposes a *floor* on the band,
 * so a real attack reaches `danger` because of what it is rather than because
 * enough cosmetic rules happened to stack up.
 */
export interface Conclusion {
  id: string;
  /** What the engine concluded, in the words a person would use. */
  title: string;
  detail: string;
  /** The lowest band this conclusion permits. */
  floor: Band;
  /** The signal ids that supported it, for the explanation graph. */
  because: string[];
}

/**
 * How much the engine trusts its own answer.
 *
 * Deliberately separate from `score`. The score is a sum of weights and says
 * nothing about likelihood; this says how strong the underlying evidence is,
 * which is the thing a person actually wants to know.
 */
export type Confidence = 'low' | 'medium' | 'high' | 'confirmed';

/** The engine's answer for one page. */
export interface Verdict {
  url: string;
  hostname: string;
  score: number;
  band: Band;
  signals: Signal[];
  /** Conclusions that fired, strongest first. Empty for most pages. */
  conclusions: Conclusion[];
  /** How good the evidence behind this verdict actually is. */
  confidence: Confidence;
  /** True when only URL-tier signals were available (no content script). */
  urlOnly: boolean;
  /**
   * Set when a user override changed the outcome.
   *  - `trusted`   the user's mark stood, and heuristics were suppressed
   *  - `overruled` the user marked it safe, but confirmed intelligence says
   *                otherwise and wins — see the note in score.ts
   *  - `reported`  the user reported it themselves
   */
  override?: 'reported' | 'trusted' | 'overruled';
  evaluatedAt: number;
}

/** A rule takes evidence and either fires (returning a Signal) or doesn't. */
export type Rule = (e: PageEvidence) => Signal | null;
