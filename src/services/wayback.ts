/**
 * When the Internet Archive first saw this site.
 *
 * A third independent answer to "how long has this really existed?", alongside
 * the registration date and the certificate history. The three together are
 * hard to fake: an attacker can buy an aged domain, but they cannot retroactively
 * put it in the Wayback Machine.
 *
 * Free, keyless, no account.
 */
const ENDPOINT = 'https://archive.org/wayback/available';
const TIMEOUT_MS = 6000;

export interface ArchiveFacts {
  /** ISO date of the earliest capture, when there is one. */
  firstCapture?: string;
  ageDays?: number;
  archived: boolean;
}

interface WaybackResponse {
  archived_snapshots?: { closest?: { available?: boolean; timestamp?: string } };
}

/** Wayback timestamps are YYYYMMDDhhmmss. */
function parseStamp(stamp: string): Date | undefined {
  const m = stamp.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return undefined;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function lookupArchive(domain: string): Promise<ArchiveFacts | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // timestamp=1996 asks for the capture closest to the dawn of the archive,
    // which in practice returns the earliest one they hold.
    const res = await fetch(
      `${ENDPOINT}?url=${encodeURIComponent(domain)}&timestamp=19960101`,
      { signal: controller.signal },
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as WaybackResponse;
    const closest = data.archived_snapshots?.closest;
    if (!closest?.available || !closest.timestamp) return { archived: false };

    const date = parseStamp(closest.timestamp);
    if (!date) return { archived: true };
    return {
      archived: true,
      firstCapture: date.toISOString().slice(0, 10),
      ageDays: Math.floor((Date.now() - date.getTime()) / 86_400_000),
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
