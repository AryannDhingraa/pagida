/**
 * DOM signal extraction.
 *
 * This runs in the page. It reads, it never writes, and it sends a fixed-shape
 * summary to the service worker rather than page content, so nothing that
 * could contain a password, a session token or personal text ever leaves the
 * tab, not even into extension storage.
 */
import type { DomEvidence } from '../../core/types.js';
import { parseHost } from '../../core/util/domain.js';
import type { TechFacts } from '../../services/report.js';
import { identityBrands } from '../../core/brandText.js';
import { extractOffline } from './offline.js';

const OBFUSCATION_MARKERS = [
  /\beval\s*\(/g,
  /\batob\s*\(/g,
  /\bunescape\s*\(/g,
  /String\.fromCharCode/g,
  /\\x[0-9a-f]{2}/gi,
  /\\u00[0-9a-f]{2}/gi,
  /document\.write\s*\(/g,
];

function pageDomain(): string {
  return parseHost(location.hostname).registrableDomain;
}

function absoluteUrl(href: string): string | null {
  try { return new URL(href, location.href).href; } catch { return null; }
}

/** Forms that contain a password field, and where they submit to. */
function analysePasswordForms() {
  const passwordInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="password"]'),
  );
  const hasPasswordField = passwordInputs.length > 0;
  // A login box hidden in a closed modal is not a page asking for a password.
  // But a two-step sign-in (Google, Microsoft, and every kit that clones them)
  // shows the email box first and keeps the password box hidden until "Next",
  // so a visible username/email box next to a password box counts too.
  // Same form only: a newsletter email box in the footer does not make a
  // closed login modal visible.
  const ID_HINT = /user|mail|login|ident|account|phone|signin/i;
  const identifierVisible = passwordInputs.some((pw) => {
    const scope: ParentNode | null = pw.form ?? pw.closest('[role="dialog"], section, main') ?? document.body;
    if (!scope) return false;
    return Array.from(scope.querySelectorAll<HTMLInputElement>(
      'input[type="email"], input[type="text"], input[type="tel"], input:not([type])',
    )).some((i) => isVisible(i) && ID_HINT.test(
      `${i.name} ${i.id} ${i.autocomplete} ${i.getAttribute('aria-label') ?? ''} ${i.placeholder} ${i.type}`));
  });
  const passwordFieldVisible = passwordInputs.some(isVisible) || identifierVisible;

  const actions = new Set<string>();
  let crossOrigin = false;
  let insecure = false;

  for (const input of passwordInputs) {
    const form = input.form;
    const raw = form?.getAttribute('action') ?? '';
    const action = absoluteUrl(raw || location.href);
    if (!action) continue;
    actions.add(action);
    try {
      const target = new URL(action);
      if (parseHost(target.hostname).registrableDomain !== pageDomain()) crossOrigin = true;
      if (location.protocol === 'https:' && target.protocol === 'http:') insecure = true;
    } catch { /* ignore unparseable actions */ }
  }

  // A password field with an inline paste blocker is a password manager blocker.
  const pasteBlocked = passwordInputs.some(
    (i) => (i.getAttribute('onpaste') ?? '').includes('false')
      || i.hasAttribute('data-no-paste')
      || (i.getAttribute('autocomplete') ?? '') === 'off' && i.hasAttribute('onpaste'),
  );

  return {
    hasPasswordField,
    passwordFieldVisible,
    passwordFormActions: [...actions],
    crossOriginPasswordForm: crossOrigin,
    insecurePasswordFormAction: insecure,
    pasteBlocked,
  };
}

/** Frames that are present but cannot be seen. */
/** Invisible by design: bot checks, tag managers, payment and chat widgets. */
const BENIGN_FRAME_DOMAINS = new Set([
  'google.com', 'googletagmanager.com', 'doubleclick.net', 'googlesyndication.com', 'gstatic.com',
  'recaptcha.net', 'hcaptcha.com', 'cloudflare.com', 'challenges.cloudflare.com', 'stripe.com',
  'stripe.network', 'paypal.com', 'braintreegateway.com', 'adyen.com', 'facebook.com', 'facebook.net',
  'twitter.com', 'linkedin.com', 'hotjar.com', 'intercom.io', 'intercomcdn.com', 'zendesk.com',
  'youtube.com', 'vimeo.com', 'bing.com', 'clarity.ms', 'tiktok.com', 'pinterest.com', 'criteo.com',
  'adnxs.com', 'amazon-adsystem.com', 'appsflyer.com', 'branch.io', 'segment.com', 'optimizely.com',
  'onetrust.com', 'cookielaw.org', 'arkoselabs.com', 'funcaptcha.com', 'datadome.co', 'px-cloud.net',
  'perimeterx.net', 'akamaihd.net', 'demdex.net', 'everesttech.net', 'rlcdn.com', 'afterpay.com',
  'zip.co', 'klarna.com', 'shopify.com', 'apple.com', 'microsoft.com', 'live.com', 'okta.com', 'auth0.com',
]);

function countHiddenIframes(): number {
  let n = 0;
  for (const frame of Array.from(document.querySelectorAll('iframe'))) {
    // Same-site and blank frames are the page's own plumbing; known widgets are
    // hidden on purpose. Only an unexplained third-party frame is interesting.
    const src = frame.getAttribute('src') ?? '';
    if (!src || src.startsWith('about:') || src.startsWith('javascript:')) continue;
    const host = hostOf(src);
    if (!host) continue;
    const reg = parseHost(host).registrableDomain;
    if (reg === pageDomain() || BENIGN_FRAME_DOMAINS.has(reg)) continue;
    const style = getComputedStyle(frame);
    const rect = frame.getBoundingClientRect();
    const invisible =
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      Number(style.opacity) === 0 ||
      rect.width <= 1 || rect.height <= 1 ||
      rect.bottom < -500 || rect.right < -500;
    if (invisible) n++;
  }
  return n;
}

/** True when an element is actually rendered and has some size. */
function isVisible(el: Element): boolean {
  const r = (el as HTMLElement).getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const st = getComputedStyle(el);
  return st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity) > 0.05;
}

/**
 * The brands this page presents itself AS, not every brand it mentions.
 * See src/core/brandText.ts for why v3's version flagged Figma as Google.
 */
function detectBrandTokens(): string[] {
  const meta = (sel: string) => document.querySelector(sel)?.getAttribute('content') ?? '';
  const selfName = [
    document.title,
    meta('meta[property="og:site_name"]'),
    meta('meta[name="application-name"]'),
  ];

  const headings = Array.from(document.querySelectorAll('h1')).slice(0, 3)
    .filter(isVisible).map((h) => h.textContent ?? '');
  // The heading or legend closest above a visible password box: "Sign in to PayPal".
  const pw = Array.from(document.querySelectorAll('input[type="password"]')).find(isVisible);
  const container = pw?.closest('form, [role="dialog"], main, section, div');
  if (container) {
    const h = container.querySelector('h1, h2, h3, legend, [role="heading"]');
    if (h?.textContent) headings.push(h.textContent);
  }

  const logos = Array.from(document.querySelectorAll<HTMLImageElement>('img[alt], svg[aria-label]'))
    .filter((el) => {
      const alt = (el.getAttribute('alt') ?? el.getAttribute('aria-label') ?? '').toLowerCase();
      const cls = `${el.getAttribute('class') ?? ''} ${el.id}`.toLowerCase();
      const inHeader = !!el.closest('header, [role="banner"], nav');
      const inForm = !!(container && container.contains(el));
      // Icons on social sign-in buttons ("GitHub" on Render's login) are a
      // third party's mark, not the page's own logo.
      const control = el.closest('button, [role="button"], a');
      if (control && (control.tagName !== 'A'
        || /continue|sign|log|with|connect|join|register/i.test(control.textContent ?? ''))) return false;
      // A logo that links off-site is someone else's: the social icons in a
      // header ("Instagram", "Facebook") or a partner badge. A page's own logo
      // links back to its own home page.
      // Only small icons, though: a copied sign-in page often links a full-size
      // brand logo back to the real brand's site, and that one should count.
      if (control?.tagName === 'A') {
        const host = hostOf((control as HTMLAnchorElement).href);
        const r = el.getBoundingClientRect();
        if (host && parseHost(host).registrableDomain !== pageDomain() && r.width <= 48 && r.height <= 48) return false;
      }
      return alt.length > 0 && (alt.includes('logo') || cls.includes('logo') || inHeader || inForm);
    })
    .slice(0, 6)
    .map((el) => el.getAttribute('alt') ?? el.getAttribute('aria-label') ?? '');

  return identityBrands({ selfName, headings, logos });
}

/** Where the favicon comes from, and whether that is somewhere else. */
function faviconOrigin(): { external: boolean; host?: string } {
  const link = document.querySelector<HTMLLinkElement>(
    'link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]',
  );
  const href = link?.getAttribute('href');
  if (!href) return { external: false };
  const abs = absoluteUrl(href);
  if (!abs) return { external: false };
  try {
    const host = new URL(abs).hostname.toLowerCase();
    return { external: parseHost(host).registrableDomain !== pageDomain(), host };
  } catch {
    return { external: false };
  }
}

/** How much of the inline script looks deliberately encoded. */
function obfuscationScore(): number {
  // JSON data islands (Next.js __NEXT_DATA__, JSON-LD, import maps) are full of
  // \u00xx escapes by design. v3 counted them as obfuscated code.
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script:not([src])'))
    .filter((s) => !s.type || /^(?:text|application)\/(?:javascript|ecmascript)$|^module$/i.test(s.type))
    .map((s) => s.textContent ?? '')
    .join('\n')
    .slice(0, 200_000); // cap the work on huge pages
  if (scripts.length < 200) return 0;

  let hits = 0;
  for (const re of OBFUSCATION_MARKERS) hits += (scripts.match(re) ?? []).length;

  // Normalise per kilobyte, then squash into 0..1. Ten markers per KB is heavy.
  const perKb = hits / (scripts.length / 1024);
  return Math.min(1, perKb / 10);
}

/** Links that visibly exist but go nowhere: the copied-login-page tell. */
function navigationHealth(): { linkCount: number; deadLinkRatio: number } {
  const anchors = Array.from(document.querySelectorAll('a'));
  if (anchors.length === 0) return { linkCount: 0, deadLinkRatio: 0 };
  let dead = 0;
  for (const a of anchors) {
    const href = (a.getAttribute('href') ?? '').trim();
    if (href === '' || href === '#' || href.startsWith('javascript:')) dead++;
  }
  return { linkCount: anchors.length, deadLinkRatio: dead / anchors.length };
}

/** True when the page installs an inline right-click blocker. */
function contextMenuBlocked(): boolean {
  const attr = document.body?.getAttribute('oncontextmenu') ?? '';
  const docAttr = document.documentElement.getAttribute('oncontextmenu') ?? '';
  return /false|preventDefault/i.test(attr + docAttr);
}

export function extractDomEvidence(): DomEvidence {
  const forms = analysePasswordForms();
  const nav = navigationHealth();
  const favicon = faviconOrigin();
  return {
    title: document.title.slice(0, 200),
    ...forms,
    hiddenIframeCount: countHiddenIframes(),
    brandTokens: detectBrandTokens(),
    externalFavicon: favicon.external,
    faviconHost: favicon.host,
    contextMenuBlocked: contextMenuBlocked(),
    obfuscationScore: obfuscationScore(),
    ...nav,
    ...extractOffline(),
  };
}

// ---------------------------------------------------------------------------
// Technology facts for the site report.
//
// None of this scores anything. It is there because "what is this site?" is a
// question people actually have, and the page itself answers a lot of it for
// free. No network call, no privacy cost: it never leaves the extension.
// ---------------------------------------------------------------------------


/** Fingerprints that are cheap, reliable and do not need the whole page's source. */
const FRAMEWORK_HINTS: Array<[string, () => boolean]> = [
  ['WordPress', () => /wp-content|wp-includes/.test(document.documentElement.innerHTML.slice(0, 60_000))],
  ['Shopify', () => 'Shopify' in window || /cdn\.shopify\.com/.test(document.documentElement.innerHTML.slice(0, 60_000))],
  ['Wix', () => /static\.wixstatic\.com|wix\.com/.test(document.documentElement.innerHTML.slice(0, 60_000))],
  ['Squarespace', () => /squarespace/i.test(document.documentElement.innerHTML.slice(0, 60_000))],
  ['Webflow', () => document.documentElement.hasAttribute('data-wf-page')],
  ['React', () => Boolean(document.querySelector('[data-reactroot], #__next')) || '__REACT_DEVTOOLS_GLOBAL_HOOK__' in window],
  ['Vue', () => Boolean(document.querySelector('[data-v-app], [data-server-rendered]'))],
  ['Angular', () => Boolean(document.querySelector('[ng-version]'))],
  ['Next.js', () => Boolean(document.getElementById('__NEXT_DATA__'))],
  ['Nuxt', () => Boolean(document.getElementById('__NUXT__'))],
  ['Cloudflare', () => /cdn-cgi\//.test(document.documentElement.innerHTML.slice(0, 30_000))],
  ['Google Analytics', () => /googletagmanager|google-analytics/.test(document.documentElement.innerHTML.slice(0, 60_000))],
];

function hostOf(url: string): string | null {
  try {
    return new URL(url, location.href).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function extractTechFacts(): TechFacts {
  const here = parseHost(location.hostname).registrableDomain;

  const scriptHosts = new Set<string>();
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'));
  for (const s of scripts) {
    const host = hostOf(s.src);
    if (host && parseHost(host).registrableDomain !== here) scriptHosts.add(host);
  }

  const linkHosts = new Set<string>();
  for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]')).slice(0, 300)) {
    const host = hostOf(a.href);
    if (host && parseHost(host).registrableDomain !== here) linkHosts.add(host);
  }

  const frameworks: string[] = [];
  for (const [name, test] of FRAMEWORK_HINTS) {
    try {
      if (test()) frameworks.push(name);
    } catch {
      // A hostile page can make any of these throw. Skip and carry on.
    }
  }

  return {
    generator: document.querySelector('meta[name="generator"]')?.getAttribute('content') ?? undefined,
    title: document.title.slice(0, 160) || undefined,
    description:
      document.querySelector('meta[name="description"]')?.getAttribute('content')?.slice(0, 300) ?? undefined,
    externalScriptHosts: [...scriptHosts].slice(0, 12),
    externalLinkHosts: [...linkHosts].slice(0, 12),
    frameworks,
    formCount: document.querySelectorAll('form').length,
    hasPasswordField: document.querySelector('input[type="password"]') !== null,
    resourceCounts: {
      scripts: scripts.length,
      images: document.querySelectorAll('img').length,
      iframes: document.querySelectorAll('iframe').length,
    },
  };
}
