/**
 * DNS lookups over HTTPS, via Cloudflare's public resolver.
 *
 * Free, no key, no account, CORS-enabled. What leaves the machine is a domain
 * name — the same thing already sent to RDAP — and never a path or a page.
 *
 * Everything here returns `undefined` rather than throwing. A site report with
 * one row missing is useful; a site report that failed is not.
 */
const DOH = 'https://cloudflare-dns.com/dns-query';
const TIMEOUT_MS = 5000;

interface DohAnswer { name: string; type: number; TTL: number; data: string }
interface DohResponse { Status: number; Answer?: DohAnswer[] }

async function query(name: string, type: string): Promise<DohAnswer[] | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${DOH}?name=${encodeURIComponent(name)}&type=${type}`, {
      signal: controller.signal,
      headers: { accept: 'application/dns-json' },
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as DohResponse;
    if (data.Status !== 0) return [];
    return data.Answer ?? [];
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export interface DnsFacts {
  /** IPv4 addresses the name resolves to. */
  ipv4?: string[];
  ipv6?: string[];
  /** Whether the domain is set up to receive email at all. */
  hasMx?: boolean;
  mxHosts?: string[];
  nameservers?: string[];
  /** The host is an alias for something else — often a CDN or a site builder. */
  cname?: string[];
  /** Published sender policy — absent is a mild negative for a real business. */
  hasSpf?: boolean;
  spf?: string;
  /** Published anti-spoofing policy, and how strict it is. */
  hasDmarc?: boolean;
  dmarcPolicy?: 'none' | 'quarantine' | 'reject';
}

/** Strips the quotes DNS TXT records arrive wrapped in. */
function unquote(s: string): string {
  return s.replace(/^"|"$/g, '').replace(/" "/g, '');
}

/**
 * @param hostname the exact host the user is on, e.g. `www.example.com`
 * @param domain   the registrable domain, e.g. `example.com`
 *
 * Addresses are looked up on the hostname, because plenty of sites publish an A
 * record only on `www` — an earlier version queried the registrable domain and
 * came back with nothing for all of them. Mail and policy records are looked up
 * on the registrable domain, which is where they are published.
 */
export async function lookupDns(hostname: string, domain: string): Promise<DnsFacts> {
  const facts: DnsFacts = {};

  // Fired together — the report is already the slowest thing Pagida does.
  const [a, aaaa, mx, ns, txt, dmarcTxt, cname] = await Promise.all([
    query(hostname, 'A'),
    query(hostname, 'AAAA'),
    query(domain, 'MX'),
    query(domain, 'NS'),
    query(domain, 'TXT'),
    query(`_dmarc.${domain}`, 'TXT'),
    query(hostname, 'CNAME'),
  ]);

  if (a) facts.ipv4 = a.filter((r) => r.type === 1).map((r) => r.data);
  if (aaaa) facts.ipv6 = aaaa.filter((r) => r.type === 28).map((r) => r.data);
  if (cname) facts.cname = cname.filter((r) => r.type === 5).map((r) => r.data.replace(/\.$/, ''));

  // Fall back to the registrable domain so the host section still has an
  // address to work with when the exact hostname has none.
  if (hostname !== domain && (!facts.ipv4 || facts.ipv4.length === 0)) {
    const fallback = await query(domain, 'A');
    if (fallback) facts.ipv4 = fallback.filter((r) => r.type === 1).map((r) => r.data);
  }

  if (mx) {
    facts.mxHosts = mx
      .filter((r) => r.type === 15)
      .map((r) => r.data.replace(/^\d+\s+/, '').replace(/\.$/, ''));
    facts.hasMx = facts.mxHosts.length > 0;
  }

  if (ns) facts.nameservers = ns.filter((r) => r.type === 2).map((r) => r.data.replace(/\.$/, ''));

  if (txt) {
    const spf = txt.map((r) => unquote(r.data)).find((v) => v.toLowerCase().startsWith('v=spf1'));
    facts.hasSpf = Boolean(spf);
    if (spf) facts.spf = spf;
  }

  if (dmarcTxt) {
    const dmarc = dmarcTxt.map((r) => unquote(r.data)).find((v) => v.toLowerCase().startsWith('v=dmarc1'));
    facts.hasDmarc = Boolean(dmarc);
    const policy = dmarc?.match(/\bp\s*=\s*(none|quarantine|reject)/i)?.[1]?.toLowerCase();
    if (policy) facts.dmarcPolicy = policy as DnsFacts['dmarcPolicy'];
  }

  return facts;
}
