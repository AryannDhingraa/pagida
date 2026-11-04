# The Pagida service

A ~150-line Cloudflare Worker. It exists so that users get the key-gated threat
list for free without registering for anything, and so that the key is never
inside a zip file that anyone can unpack.

It receives a bare domain name, checks it against Google Web Risk, and returns a
verdict. It stores nothing.

## Why Web Risk and not Safe Browsing

The Safe Browsing API's free tier is **non-commercial use only**. Pagida is free
and open source, so the extension itself is fine — but a shared server offering
the lookup to other people is a redistribution the terms do not allow, however
free it is.

Google **Web Risk** allows commercial use and gives 100,000 Lookup API calls a
month at no cost. That is the entire reason this is Web Risk.

## Cost

| | Free tier | What Pagida v5 uses |
|---|---|---|
| Cloudflare Workers | 100,000 requests/day | only lookups the extension could not answer offline |
| Durable Objects (SQLite) | 100,000 requests and rows written/day | one per upstream lookup, for the exact daily budget |
| Rate-limiting binding | per Cloudflare's plan | per-IP and per-install limits |
| Google Web Risk | 100,000 lookups/month | at most 3,000 a day, so at most 93,000 a month |

v4 counted requests with three Workers KV writes each. KV's free plan allows
1,000 writes a day and one write per second to the same key, so the proxy
silently stopped after about 330 lookups a day. v5 uses no KV, and if the
budget or the limiters are missing it refuses lookups rather than running
unmetered. The extension treats "busy" as "no answer" and keeps working offline.

## Deploy

The deployable project lives in its own folder (`pagida-proxy`, next to this
repo), with `wrangler.jsonc` already declaring the Durable Object, its
migration and both rate limiters. From that folder:

```bash
npm install
npx wrangler secret put WEB_RISK_KEY   # paste your Web Risk API key
npx wrangler deploy
```

After deploying v5, delete the old `QUOTA` KV namespace in the Cloudflare
dashboard: nothing uses it any more.

Getting the key: Google Cloud Console → create a project → enable the **Web Risk
API** → Credentials → Create credentials → API key. Restrict it to the Web Risk
API. It does not need a referrer restriction, because it is only ever used
server-side.

Then set the deployed URL in `src/services/pagidaApi.ts`:

```ts
export const API_BASE = 'https://pagida-proxy.<your-subdomain>.workers.dev';
```

Rebuild the extension. Check it works:

```bash
curl 'https://pagida-proxy.<your-subdomain>.workers.dev/v1/health'
# {"ok":true,"webRisk":true,"metered":true}   <- "metered":false means lookups are refused
```

## What it deliberately does not do

- **No logging.** Not IP, not install id, not the domain asked about. There is
  no log statement in the file, and that is intentional rather than an omission.
- **No paths.** `cleanDomain` rejects anything that is not a bare hostname, so a
  bug in the extension cannot leak a URL through this endpoint.
- **No authentication.** An install id is a quota counter, not an account. It is
  forgeable, which is fine: the worst case is someone spending a slice of the
  daily allowance, and the daily allowance is what protects the budget.

## If the quota runs out

The Worker returns `429` and the extension treats that as "no answer" — the
other twenty-one signals carry on and the user sees nothing. Failing invisibly
is the correct behaviour here; a security tool that starts nagging about its own
billing has lost the plot.
