/**
 * DMARC policy of one domain, for the email check.
 *
 * Brand domains come bundled (src/core/data/dmarc.ts) and are never looked up
 * from here. The one domain looked up live is the reader's own organisation,
 * when an email claims to come from it: Cloudflare's public DNS is asked for
 * that domain's "_dmarc" record. Only the domain name is sent. The answer is
 * kept for 30 days, so it is asked about once a month.
 */
import { parseDmarc, type DmarcPolicy } from '../core/dmarc.js';
import { BRAND_DMARC } from '../core/data/dmarc.js';
import { parseHost } from '../core/util/domain.js';

const ENDPOINT = 'https://cloudflare-dns.com/dns-query';
const TTL = 30 * 24 * 60 * 60 * 1000;

type Cache = Record<string, { policy: DmarcPolicy; at: number }>;

export function bundledDmarc(domain: string): DmarcPolicy | undefined {
  return BRAND_DMARC[parseHost(domain).registrableDomain];
}

export async function lookupDmarc(domain: string): Promise<DmarcPolicy | undefined> {
  const org = parseHost(domain).registrableDomain;
  if (!org || !org.includes('.')) return undefined;
  const { dmarcCache } = await chrome.storage.local.get('dmarcCache');
  const cache = (dmarcCache ?? {}) as Cache;
  const hit = cache[org];
  if (hit && Date.now() - hit.at < TTL) return hit.policy;
  try {
    const res = await fetch(`${ENDPOINT}?name=_dmarc.${encodeURIComponent(org)}&type=TXT`, {
      headers: { accept: 'application/dns-json' }, credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return undefined;
    const body = await res.json() as { Status: number; Answer?: { data: string }[] };
    if (body.Status !== 0 && body.Status !== 3) return undefined;
    const policy = body.Status === 3 ? 'missing' : parseDmarc((body.Answer ?? []).map((a) => a.data));
    cache[org] = { policy, at: Date.now() };
    await chrome.storage.local.set({ dmarcCache: cache });
    return policy;
  } catch { return undefined; }
}
