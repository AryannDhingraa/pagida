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

| | Free tier | What Pagida uses |
|---|---|---|
| Cloudflare Workers | 100,000 requests/day | one per unique domain, per user, per 6 hours |
| Cloudflare KV | 1,000 writes/day | one per lookup |
| Google Web Risk | 100,000 lookups/month | one per uncached domain |

The Worker caches at Cloudflare's edge for 15 minutes and the extension caches
locally for 6 hours, so popular domains cost one upstream call between all
users. The realistic ceiling before any of this costs money is a few thousand
active users. The KV write limit will bite before the Web Risk quota does; when
it does, move the counter to Durable Objects or drop the per-install quota.

## Deploy

```bash
npm create cloudflare@latest pagida-proxy
cd pagida-proxy
# replace src/index.js with worker.js from this directory

npx wrangler kv namespace create QUOTA
# paste the returned id into wrangler.toml:
#   [[kv_namespaces]]
#   binding = "QUOTA"
#   id = "..."

npx wrangler secret put WEB_RISK_KEY   # paste your Web Risk API key
npx wrangler deploy
```

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
# {"ok":true,"webRisk":true}
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
