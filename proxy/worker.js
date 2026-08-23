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

/** Per-install daily ceiling, so one abusive client cannot burn the free tier. */
const DAILY_LIMIT = 250;

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

/**
 * A per-install daily counter in KV.
 *
 * The install id is a random UUID the extension makes up for itself. It is not
 * an account and it is not tied to a person — it exists only so that one
 * runaway client cannot spend everyone else's quota. The key expires daily, so
 * nothing accumulates.
 */
async function withinQuota(env, installId) {
  if (!env.QUOTA) return true; // no KV bound — fail open rather than break
  const day = new Date().toISOString().slice(0, 10);
  const key = `q:${day}:${installId}`;
  const used = Number((await env.QUOTA.get(key)) ?? 0);
  if (used >= DAILY_LIMIT) return false;
  await env.QUOTA.put(key, String(used + 1), { expirationTtl: 60 * 60 * 26 });
  return true;
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
    if (!(await withinQuota(env, installId))) {
      return json({ error: 'daily-limit' }, 429);
    }

    if (url.pathname === '/v1/webrisk') {
      const domain = cleanDomain(url.searchParams.get('domain'));
      if (!domain) return json({ error: 'bad-domain' }, 400);
      return json(await webRisk(env, domain));
    }

    return json({ error: 'not-found' }, 404);
  },
};
