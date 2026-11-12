/**
 * What a domain tells mail servers to do with forged mail in its name.
 *
 * reject      forged mail is refused: it should never reach an inbox
 * quarantine  forged mail goes to spam
 * none        forged mail is delivered as normal: the address can be faked
 * missing     no policy at all: the same as none
 */
export type DmarcPolicy = 'reject' | 'quarantine' | 'none' | 'missing';

/** The policy from a domain's _dmarc TXT records (quoted or not). */
export function parseDmarc(records: string[]): DmarcPolicy {
  for (const raw of records) {
    const txt = raw.replace(/"\s*"/g, '').replace(/"/g, '').trim();
    if (!/^v\s*=\s*DMARC1\b/i.test(txt)) continue;
    const p = /(?:^|;)\s*p\s*=\s*(reject|quarantine|none)\b/i.exec(txt)?.[1]?.toLowerCase();
    return (p as DmarcPolicy | undefined) ?? 'none';
  }
  return 'missing';
}

/** True when mail can be sent in this domain's name and still reach the inbox. */
export const forgeable = (p: DmarcPolicy | undefined): boolean => p === 'none' || p === 'missing';
