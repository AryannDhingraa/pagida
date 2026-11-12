/**
 * Pagida API proxy, v5: a Cloudflare Worker.
 *
 * WHY THIS EXISTS
 *
 * Google's Web Risk list needs an API key, and a key shipped inside an
 * extension is public the moment someone unzips it. So the key lives here and
 * the extension asks this Worker. Since Pagida v5 this is a backup, not the
 * main engine: the extension checks pages offline first, skips the world's top
 * 10,000 sites, never asks about a page it has already caught, and remembers
 * clean answers for a day. Most visits never reach this Worker at all.
 *
 * WHAT CHANGED FROM v4, AND WHY
 *
 * v4 counted every request with three Workers KV writes. The KV free plan
 * allows 1,000 writes a day, and 1 write per second to the same key, and the
 * global counter was the same key every time. So the proxy stopped working
 * after about 330 lookups a day, and concurrent users collided before that.
 * Its daily ceiling (60,000) was also far above Web Risk's free 100,000 a
 * month, so fixing KV alone could have produced a bill of hundreds of dollars.
 *
 * v5 uses no KV at all:
 *   BUDGET   A Durable Object holds the one global daily counter. One object,
 *            strongly consistent, so the ceiling is exact. DAILY_BUDGET is set
 *            so a full month stays inside Web Risk's free 100,000 lookups.
 *   LIMITER  Cloudflare's rate-limiting binding, per IP and per install, to
 *            stop one client from eating the day's budget. Approximate and per
 *            location by design, which is fine for this job.
 *   MEMO     A per-isolate in-memory cache of recent answers, so a burst of
 *            users on the same site costs one upstream call.
 * If either binding is missing the Worker fails CLOSED (answers "busy"), never
 * open: an unmetered proxy is how a free project gets a bill.
 *
 * PRIVACY
 *
 * Only a bare domain name is accepted; anything with a path is refused.
 * Nothing is logged. The only things stored are the day's request count and,
 * per network, a count kept under a hash of the day and the IP address (never
 * the address). Both are deleted two days later.
 *
 * DEPLOY (from this folder)
 *
 *   npm install
 *   npx wrangler secret put WEB_RISK_KEY
 *   npx wrangler deploy
 *
 * wrangler.jsonc declares the Durable Object, its migration and the two rate
 * limiters. Delete the old KV namespace in the dashboard afterwards.
 */

const ALLOWED_ORIGIN_PREFIX = 'chrome-extension://';

/** 3,000 a day x 31 days = 93,000: inside Web Risk's free 100,000 a month. */
const DAILY_BUDGET = 3000;
/**
 * One network's share of a day. The per-minute limiters alone let a single IP
 * spend 30 a minute, which empties the whole day in under two hours and turns
 * the online check off for everyone. 150 covers an office or a family behind
 * one address, and it would take 20 networks working together to drain a day.
 */
const DAILY_PER_IP = 150;
const MEMO_TTL_MS = 60 * 60 * 1000;
const MEMO_MAX = 2000;

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

/** Only ever accept a bare hostname. Never a path, never a query string. */
export function cleanDomain(raw) {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (value.length > 253) return null;
  if (!/^[a-z0-9.-]+$/.test(value)) return null;
  if (!value.includes('.') || value.startsWith('.') || value.endsWith('.') || value.includes('..')) return null;
  return value;
}

/** Short-lived memory of answers, per isolate. */
const memo = new Map();
function memoGet(domain) {
  const hit = memo.get(domain);
  if (!hit) return null;
  if (Date.now() - hit.at > MEMO_TTL_MS) { memo.delete(domain); return null; }
  return hit.value;
}
function memoSet(domain, value) {
  if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value);
  memo.set(domain, { at: Date.now(), value });
}

/**
 * The global daily budget. One Durable Object instance per day, so the count
 * is exact everywhere in the world.
 */
export class Budget {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const params = new URL(request.url).searchParams;
    const limit = Number(params.get('limit') ?? DAILY_BUDGET);
    const perIp = Number(params.get('perIp') ?? DAILY_PER_IP);
    const who = params.get('who');
    // Both counts live in this one object, so the check and the spend are one
    // step and two requests can never both take the last lookup.
    const used = (await this.state.storage.get('used')) ?? 0;
    if (used >= limit) return new Response('spent', { status: 429 });
    const whoKey = who ? `who:${who}` : null;
    const usedByWho = whoKey ? (await this.state.storage.get(whoKey)) ?? 0 : 0;
    if (whoKey && usedByWho >= perIp) return new Response('your share is spent', { status: 429 });
    const writes = { used: used + 1 };
    if (whoKey) writes[whoKey] = usedByWho + 1;
    await this.state.storage.put(writes);
    // Yesterday's object is no use to anyone: empty it two days on, so no
    // network's count outlives the day it was for.
    if (used === 0 && (await this.state.storage.getAlarm()) === null) {
      await this.state.storage.setAlarm(Date.now() + 2 * 24 * 60 * 60 * 1000);
    }
    return new Response(String(used + 1));
  }

  async alarm() {
    await this.state.storage.deleteAll();
  }
}

/**
 * A network's count is kept under a hash of the day and its address, never
 * the address itself, and the day's object deletes itself after two days.
 */
async function networkKey(ip, day) {
  const bytes = new TextEncoder().encode(`${day}|${ip}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest.slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** True when this request may spend one upstream lookup. */
async function spend(env, request, installId) {
  // Fail closed: no meter, no lookups.
  if (!env.BUDGET || !env.IP_LIMITER || !env.INSTALL_LIMITER) return false;

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const [byIp, byInstall] = await Promise.all([
    env.IP_LIMITER.limit({ key: `ip:${ip}` }),
    env.INSTALL_LIMITER.limit({ key: `install:${installId}` }),
  ]);
  if (!byIp.success || !byInstall.success) return false;

  const day = new Date().toISOString().slice(0, 10);
  const stub = env.BUDGET.get(env.BUDGET.idFromName(day));
  const who = await networkKey(ip, day);
  const res = await stub.fetch(`https://budget/spend?limit=${DAILY_BUDGET}&perIp=${DAILY_PER_IP}&who=${who}`);
  return res.ok;
}

async function webRisk(env, domain) {
  if (!env.WEB_RISK_KEY) return { error: 'not-configured' };

  // Web Risk takes a URI. A bare https:// on the domain is enough to get a
  // verdict on the site without the proxy ever seeing a path.
  const params = new URLSearchParams({ uri: `https://${domain}/`, key: env.WEB_RISK_KEY });
  for (const type of ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE']) params.append('threatTypes', type);

  const res = await fetch(`https://webrisk.googleapis.com/v1/uris:search?${params}`);
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error?.message ?? body?.error?.status ?? '';
    } catch { /* not JSON */ }
    // Google does not echo the key in its errors, but this response is public.
    const safe = String(detail).replace(/AIza[0-9A-Za-z_-]{10,}/g, '[key]');
    return { error: `upstream-${res.status}`, detail: safe.slice(0, 220) };
  }

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
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'GET') return json({ error: 'method-not-allowed' }, 405);

    const url = new URL(request.url);

    if (url.pathname === '/v1/health') {
      return json({ ok: true, webRisk: Boolean(env.WEB_RISK_KEY), metered: Boolean(env.BUDGET && env.IP_LIMITER && env.INSTALL_LIMITER) });
    }

    // A courtesy check, not a security boundary: the meter is what protects the budget.
    const origin = request.headers.get('Origin') ?? '';
    if (!(origin === '' || origin.startsWith(ALLOWED_ORIGIN_PREFIX))) return json({ error: 'forbidden' }, 403);

    if (url.pathname !== '/v1/webrisk') return json({ error: 'not-found' }, 404);

    const domain = cleanDomain(url.searchParams.get('domain'));
    if (!domain) return json({ error: 'bad-domain' }, 400);

    // A remembered answer costs nothing, so it is served before the meter.
    const remembered = memoGet(domain);
    if (remembered) return json(remembered);

    const installId = (request.headers.get('X-Pagida-Install') ?? '').slice(0, 64) || 'anonymous';
    if (!(await spend(env, request, installId))) return json({ error: 'busy' }, 429);

    const answer = await webRisk(env, domain);
    if (!answer.error) memoSet(domain, answer);
    return json(answer);
  },
};
