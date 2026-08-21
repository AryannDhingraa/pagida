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
