/**
 * Certificate history from the public Certificate Transparency logs, via crt.sh.
 *
 * This answers a question RDAP cannot: not "when was this domain bought?" but
 * "when did anyone first put a working website on it?". A domain registered
 * years ago and only certificated last week is a classic aged-domain purchase —
 * bought precisely to defeat the domain-age check.
 *
 * crt.sh is free and keyless but slow and occasionally unavailable, so this is
 * the one lookup with a long timeout and the most forgiving failure path.
 */
const ENDPOINT = 'https://crt.sh/';
const TIMEOUT_MS = 9000;

export interface CertFacts {
  /** Earliest certificate ever logged for this domain. */
  firstSeen?: string;
  /** Most recent certificate logged. */
  lastSeen?: string;
  /** How many certificates in total — a real business has a long trail. */
  total?: number;
  /** Distinct issuers, most recent first. */
  issuers?: string[];
  /** Days since the first certificate, or undefined when unknown. */
  ageDays?: number;
}

interface CrtRow {
  issuer_name?: string;
  not_before?: string;
  not_after?: string;
  name_value?: string;
}

export async function lookupCerts(domain: string): Promise<CertFacts | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ENDPOINT}?q=${encodeURIComponent(domain)}&output=json&exclude=expired`, {
      signal: controller.signal,
    });
    if (!res.ok) return undefined;
    const rows = (await res.json()) as CrtRow[];
    if (!Array.isArray(rows) || rows.length === 0) return { total: 0 };

    const dates = rows
      .map((r) => r.not_before)
      .filter((d): d is string => Boolean(d))
      .map((d) => new Date(d).getTime())
      .filter((t) => !Number.isNaN(t))
      .sort((a, b) => a - b);

    const issuers = [...new Set(
      rows.map((r) => (r.issuer_name ?? '').match(/O="?([^",]+)/)?.[1]?.trim()).filter(Boolean) as string[],
    )].slice(0, 4);

    const first = dates[0];
    return {
      total: rows.length,
      issuers,
      firstSeen: first ? new Date(first).toISOString().slice(0, 10) : undefined,
      lastSeen: dates.length ? new Date(dates[dates.length - 1]!).toISOString().slice(0, 10) : undefined,
      ageDays: first ? Math.floor((Date.now() - first) / 86_400_000) : undefined,
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
