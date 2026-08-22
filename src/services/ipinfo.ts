/**
 * Who owns the address a site is served from, and where it sits.
 *
 * ipwho.is is free, keyless, HTTPS and CORS-friendly. It answers the question
 * that makes a hosting fact meaningful to a non-technical person: not
 * "45.61.x.x" but "a bulk hosting company in Seychelles".
 *
 * Fails soft like everything else — an unknown row is fine, a broken report is not.
 */
const ENDPOINT = 'https://ipwho.is/';
const TIMEOUT_MS = 5000;

export interface IpFacts {
  ip: string;
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  /** The network operator — "Cloudflare", "Amazon", "some reseller in Belize". */
  asnName?: string;
  asn?: string;
  isp?: string;
  /** ipwho.is flags obvious datacentre ranges; useful but not conclusive. */
  isHosting?: boolean;
}

interface IpWhoResponse {
  success?: boolean;
  ip?: string;
  country?: string;
  country_code?: string;
  region?: string;
  city?: string;
  connection?: { asn?: number; org?: string; isp?: string; domain?: string };
  security?: { hosting?: boolean; proxy?: boolean };
}

export async function lookupIp(ip: string): Promise<IpFacts | undefined> {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return undefined;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT + encodeURIComponent(ip), { signal: controller.signal });
    if (!res.ok) return undefined;
    const d = (await res.json()) as IpWhoResponse;
    if (d.success === false) return undefined;
    return {
      ip,
      country: d.country,
      countryCode: d.country_code,
      region: d.region,
      city: d.city,
      asn: d.connection?.asn ? `AS${d.connection.asn}` : undefined,
      asnName: d.connection?.org,
      isp: d.connection?.isp,
      isHosting: d.security?.hosting,
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
