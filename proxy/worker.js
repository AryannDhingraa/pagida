/**
 * Pagida API proxy — a Cloudflare Worker.
 *
 * WHY THIS EXISTS
 *
 * Pagida should give everyone the full service without asking them to go and
 * register for API keys. But an extension is a zip file: anything shipped
 * inside it is public the moment someone unzips it, and a key posted publicly
 * gets scraped, abused and revoked within days. There is no clever way around
 * that — obfuscation just makes it take an afternoon instead of a minute.
 *
 * So the keys live here instead, on a server the extension talks to. Users get
 * the service for free and never see a key.
 *
 * WHAT THIS COSTS
 *
 * Cloudflare Workers: 100,000 requests/day free.
 * Google Web Risk:    100,000 lookups/month free, and commercial use is allowed
 *                     — which is the whole reason Pagida uses Web Risk here
 *                     rather than the Safe Browsing API, whose free tier is
 *                     non-commercial only and could not legally be resold this
 *                     way even for free.
 *
 * WHAT IT COSTS THE USER, WHICH IS THE PART THAT MATTERS
 *
 * This server sees the domain names it is asked about. That is a real change to
 * Pagida's privacy story and it has to be stated plainly rather than buried:
 *  - Only the domain is ever sent, never the full URL, never the page. The
 *    sanitiser below rejects anything containing a path, so a bug in the
 *    extension cannot leak a URL here even by accident.
 *  - Nothing is logged. No IP, no install id, no query history, no analytics.
 *  - It is ON by default, and that is a deliberate call rather than an
 *    oversight: a protection nobody finds in a settings screen protects
 *    nobody, and the people most likely to be phished are the least likely to
 *    go looking. The trade is disclosed in the extension's own words on the
 *    options page and in the store listing, and one switch turns it off.
 *  - The keyless sources keep working with it switched off, so refusing costs
 *    the user some depth, never the product.
 *
 * DEPLOY
 *
 *   npm create cloudflare@latest pagida-proxy
 *   # replace src/index.js with this file
 *   npx wrangler secret put WEB_RISK_KEY
 *   npx wrangler kv namespace create QUOTA
 *   # put the id into wrangler.toml as the QUOTA binding
 *   npx wrangler deploy
 *
 * Then set PAGIDA_API_BASE in the extension build to the deployed URL.
 */

const ALLOWED_ORIGIN_PREFIX = 'chrome-extension://';

/**
 * ABUSE CONTROL
 *
 * An earlier version of this file rate-limited on the install id alone and
 * admitted in a comment that anyone could forge the header. That is true, and
 * it is not a small problem: a forged id is a fresh bucket, so an attacker with
 * a loop could spend the whole month's Web Risk allowance in an afternoon and
 * every real user would silently lose the feature.
 *
 * Three buckets now, checked in order of how expensive they are to evade:
 *
 *   GLOBAL   A hard ceiling on total upstream calls per day. Forgeable
 *            identifiers cannot get past this one, because it does not depend
 *            on any identifier at all. It is the actual budget guarantee; the
 *            other two exist to stop one client eating that budget.
 *   NETWORK  Per source IP, which Cloudflare supplies and a client cannot set.
 *            Evading it costs real infrastructure.
 *   INSTALL  Per install id. Trivially forgeable, kept because it is the one
 *            that correctly separates several users behind one office NAT.
 *
 * Every key is a hash, never the raw value, and every key expires daily. The
 * server therefore cannot reconstruct who asked about what even if it wanted to.
 */
const GLOBAL_DAILY_LIMIT = 60_000;   // of the 100k/month Web Risk allowance
const NETWORK_DAILY_LIMIT = 2_000;   // generous for a NAT, useless for a script
const INSTALL_DAILY_LIMIT = 250;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Pagida-Install',
  'Access-Control-Max-Age': '86400',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

/** Short, stable, and irreversible — so no key in KV is a raw identifier. */
async function hashKey(value) {
  const bytes = new TextEncoder().encode(`pagida:${value}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest).slice(0, 8)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Increment one counter and report whether it is still under its ceiling.
 *
 * Deliberately not atomic. KV is eventually consistent, so two simultaneous
 * requests can both read the same value and under-count — which means the real
 * ceiling is fuzzy at the edges. That is the correct trade here: the failure
 * mode is spending slightly more of a free allowance than intended, and the
 * alternative (Durable Objects) costs money to avoid a rounding error. If this
 * ever guards something billable, move it.
 */
async function underLimit(env, key, limit, ttlSeconds = 60 * 60 * 26) {
  if (!env.QUOTA) return true; // no KV bound — fail open rather than break
  const used = Number((await env.QUOTA.get(key)) ?? 0);
  if (used >= limit) return false;
  await env.QUOTA.put(key, String(used + 1), { expirationTtl: ttlSeconds });
  return true;
}

/**
 * The three buckets, cheapest to evade last.
 *
 * Returns null when the request may proceed, or a short reason when it may not.
 * The reason is never sent to the client — a rate limiter that tells you which
 * limit you hit is a rate limiter that tells you how to route around it.
 */
async function checkQuota(env, request, installId) {
  const day = new Date().toISOString().slice(0, 10);

  if (!(await underLimit(env, `g:${day}`, GLOBAL_DAILY_LIMIT))) return 'global';

  const ip = request.headers.get('CF-Connecting-IP') ?? '';
  if (ip) {
    const key = `n:${day}:${await hashKey(ip)}`;
    if (!(await underLimit(env, key, NETWORK_DAILY_LIMIT))) return 'network';
  }

  const key = `i:${day}:${await hashKey(installId)}`;
  if (!(await underLimit(env, key, INSTALL_DAILY_LIMIT))) return 'install';

  return null;
}

/** Only ever accept a bare hostname. Never a path, never a query string. */
function cleanDomain(raw) {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (value.length > 253) return null;
  if (!/^[a-z0-9.-]+$/.test(value)) return null;
  if (!value.includes('.')) return null;
  return value;
}

async function webRisk(env, domain) {
  if (!env.WEB_RISK_KEY) return { error: 'not-configured' };

  // Web Risk takes a URI. A bare https:// on the domain is enough to get a
  // verdict on the site without the proxy ever seeing a path.
  const uri = `https://${domain}/`;
  const params = new URLSearchParams({ uri, key: env.WEB_RISK_KEY });
  for (const type of ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE']) {
    params.append('threatTypes', type);
  }

  const res = await fetch(`https://webrisk.googleapis.com/v1/uris:search?${params}`, {
    cf: { cacheTtl: 900, cacheEverything: true },
  });
  if (!res.ok) return { error: `upstream-${res.status}` };

  const data = await res.json();
  const threat = data?.threat;
  return {
    listed: Boolean(threat),
    threatTypes: threat?.threatTypes ?? [],
    expires: threat?.expireTime ?? null,
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== 'GET') {
      return json({ error: 'method-not-allowed' }, 405);
    }

    const url = new URL(request.url);

    if (url.pathname === '/v1/health') {
      return json({ ok: true, webRisk: Boolean(env.WEB_RISK_KEY) });
    }

    // Extensions send an Origin of chrome-extension://<id>. This is a courtesy
    // check, not a security boundary — anyone can forge a header — which is
    // exactly why the quota below is what actually protects the budget.
    const origin = request.headers.get('Origin') ?? '';
    const looksLikeExtension = origin === '' || origin.startsWith(ALLOWED_ORIGIN_PREFIX);
    if (!looksLikeExtension) return json({ error: 'forbidden' }, 403);

    const installId = (request.headers.get('X-Pagida-Install') ?? '').slice(0, 64) || 'anonymous';

    // Quota is checked before the route, so an unknown path cannot be used as a
    // free way to probe whether the service is up.
    if (await checkQuota(env, request, installId)) {
      return json({ error: 'busy' }, 429);
    }

    if (url.pathname === '/v1/webrisk') {
      const domain = cleanDomain(url.searchParams.get('domain'));
      if (!domain) return json({ error: 'bad-domain' }, 400);
      return json(await webRisk(env, domain));
    }

    return json({ error: 'not-found' }, 404);
  },
};
