/**
 * abuse.ch URLhaus — a public database of URLs used to distribute malware.
 *
 * Complements the phishing feed rather than duplicating it: OpenPhish covers
 * credential theft, URLhaus covers payload delivery. A site on either is one
 * you want to hear about.
 *
 * Free and keyless. The host endpoint is a POST form, which is why this one
 * looks different from the other services.
 */
const ENDPOINT = 'https://urlhaus-api.abuse.ch/v1/host/';
const TIMEOUT_MS = 6000;

export interface MalwareFacts {
  /** URLhaus has a record for this host. */
  listed: boolean;
  /** How many malicious URLs they have recorded on it. */
  urlCount?: number;
  /** Their current view: "online", "offline", or absent. */
  status?: string;
  /** Malware families seen, if any. */
  tags?: string[];
  firstSeen?: string;
}

interface UrlhausResponse {
  query_status?: string;
  firstseen?: string;
  url_count?: string;
  urls?: Array<{ url_status?: string; tags?: string[] }>;
}

export async function lookupMalware(hostname: string): Promise<MalwareFacts | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const body = new URLSearchParams({ host: hostname });
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) return undefined;
    const d = (await res.json()) as UrlhausResponse;

    if (d.query_status === 'no_results') return { listed: false };
    if (d.query_status !== 'ok') return undefined;

    const tags = [...new Set((d.urls ?? []).flatMap((u) => u.tags ?? []))].slice(0, 8);
    return {
      listed: true,
      urlCount: d.url_count ? Number(d.url_count) : (d.urls?.length ?? undefined),
      status: d.urls?.find((u) => u.url_status === 'online') ? 'online' : 'offline',
      tags,
      firstSeen: d.firstseen?.slice(0, 10),
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
