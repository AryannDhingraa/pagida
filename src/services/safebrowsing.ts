/**
 * Google Safe Browsing lookups.
 *
 * Off by default and requires the user to paste their own API key, for two
 * reasons. First, a shipped key in an extension package is a key that is
 * public. Second, this sends the full URL to Google — which is a reasonable
 * trade for some people and not for others, so it is theirs to make, not ours.
 *
 * Terms note: the Safe Browsing API is free but non-commercial only. Pagida is
 * free and open source, which keeps it inside those terms. A paid tier would
 * require migrating to Google Web Risk.
 */
const ENDPOINT = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';
const TIMEOUT_MS = 4000;

interface ThreatMatchResponse {
  matches?: Array<{ threatType?: string }>;
}

export async function safeBrowsingLookup(url: string, apiKey: string): Promise<boolean | undefined> {
  if (!apiKey) return undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: { clientId: 'pagida', clientVersion: '1.0.0' },
        threatInfo: {
          threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url }],
        },
      }),
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as ThreatMatchResponse;
    return (data.matches?.length ?? 0) > 0;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
