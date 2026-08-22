/**
 * What is actually running at an IP address, from Shodan's InternetDB.
 *
 * Free, keyless, CORS-enabled, and read-only: it returns what Shodan already
 * knows from its own scanning. Pagida never scans anything itself — probing a
 * third party's infrastructure without authorisation is a criminal offence in
 * Australia and most other places, and a defensive tool has no business doing
 * it. This is a lookup of someone else's public dataset, nothing more.
 */
const ENDPOINT = 'https://internetdb.shodan.io/';
const TIMEOUT_MS = 5000;

export interface HostFacts {
  ip: string;
  /** Other names Shodan has seen on this address. */
  hostnames?: string[];
  /** Ports found open. A consumer web host with RDP exposed is worth knowing about. */
  ports?: number[];
  /** CVE identifiers Shodan associates with this host. */
  vulns?: string[];
  /** Shodan's own tags, e.g. "cloud", "self-signed". */
  tags?: string[];
}

interface InternetDbResponse {
  ip?: string;
  hostnames?: string[];
  ports?: number[];
  vulns?: string[];
  tags?: string[];
  cpes?: string[];
}

export async function lookupHost(ip: string): Promise<HostFacts | undefined> {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return undefined;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT + encodeURIComponent(ip), { signal: controller.signal });
    // 404 is a real answer: Shodan has never seen this address.
    if (res.status === 404) return { ip };
    if (!res.ok) return undefined;
    const data = (await res.json()) as InternetDbResponse;
    return {
      ip,
      hostnames: data.hostnames?.slice(0, 6),
      ports: data.ports?.slice(0, 20),
      vulns: data.vulns?.slice(0, 12),
      tags: data.tags?.slice(0, 8),
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** Ports that have no business being open on something serving a login page. */
export const ALARMING_PORTS: Record<number, string> = {
  21: 'FTP — unencrypted file transfer',
  23: 'Telnet — unencrypted remote login',
  445: 'Windows file sharing, exposed to the internet',
  1433: 'Microsoft SQL Server, exposed to the internet',
  3306: 'MySQL, exposed to the internet',
  3389: 'Windows Remote Desktop, exposed to the internet',
  5432: 'PostgreSQL, exposed to the internet',
  5900: 'VNC remote control',
  6379: 'Redis, usually with no password',
  27017: 'MongoDB, exposed to the internet',
};
