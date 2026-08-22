/**
 * DOM signal extraction.
 *
 * This runs in the page. It reads, it never writes, and it sends a fixed-shape
 * summary to the service worker rather than page content — so nothing that
 * could contain a password, a session token or personal text ever leaves the
 * tab, not even into extension storage.
 */
import type { DomEvidence } from '../core/types.js';
import { parseHost } from '../core/util/domain.js';
import type { TechFacts } from '../services/report.js';
import { BRAND_TOKENS } from '../core/data/brands.js';

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
    passwordFormActions: [...actions],
    crossOriginPasswordForm: crossOrigin,
    insecurePasswordFormAction: insecure,
    pasteBlocked,
  };
}

/** Frames that are present but cannot be seen. */
function countHiddenIframes(): number {
  let n = 0;
  for (const frame of Array.from(document.querySelectorAll('iframe'))) {
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

/** Brand names visible in the page's own description of itself. */
function detectBrandTokens(): string[] {
  const parts: string[] = [
    document.title,
    document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
    document.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ?? '',
    ...Array.from(document.querySelectorAll('h1, h2')).slice(0, 10).map((h) => h.textContent ?? ''),
    ...Array.from(document.querySelectorAll('img[alt]')).slice(0, 30)
      .map((i) => i.getAttribute('alt') ?? ''),
    ...Array.from(document.querySelectorAll('button, input[type="submit"]')).slice(0, 20)
      .map((b) => b.textContent ?? (b as HTMLInputElement).value ?? ''),
  ];
  const haystack = parts.join(' ').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return BRAND_TOKENS.filter((t) => t.length >= 4 && haystack.includes(t)).slice(0, 5);
}

/** Favicon served from somewhere other than this site. */
function hasExternalFavicon(): boolean {
  const link = document.querySelector<HTMLLinkElement>(
    'link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]',
  );
  const href = link?.getAttribute('href');
  if (!href) return false;
  const abs = absoluteUrl(href);
  if (!abs) return false;
  try {
    return parseHost(new URL(abs).hostname).registrableDomain !== pageDomain();
  } catch { return false; }
}

/** How much of the inline script looks deliberately encoded. */
function obfuscationScore(): number {
  const scripts = Array.from(document.querySelectorAll('script:not([src])'))
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

/** Links that visibly exist but go nowhere — the copied-login-page tell. */
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
  return {
    title: document.title.slice(0, 200),
    ...forms,
    hiddenIframeCount: countHiddenIframes(),
    brandTokens: detectBrandTokens(),
    externalFavicon: hasExternalFavicon(),
    contextMenuBlocked: contextMenuBlocked(),
    obfuscationScore: obfuscationScore(),
    ...nav,
  };
}

// ---------------------------------------------------------------------------
// Technology facts for the site report.
//
// None of this scores anything — it is there because "what is this site?" is a
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
