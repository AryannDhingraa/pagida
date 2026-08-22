/**
 * The typed message protocol between content script, service worker and UI.
 * Keeping it in one file means a rename breaks the build rather than breaking
 * silently at runtime, which is the usual failure mode in extensions.
 */
import type { DomEvidence, Verdict } from '../core/types.js';
import type { SiteReport } from '../services/report.js';

export type Message =
  /** Content script -> worker: here is what the page looks like. */
  | { type: 'PAGE_SIGNALS'; url: string; dom: DomEvidence }
  /** Popup -> worker: what did you decide about the tab I'm on? */
  | { type: 'GET_VERDICT'; tabId?: number }
  /** Popup/link page -> worker: score this URL without visiting it. */
  | { type: 'CHECK_URL'; url: string }
  /** Popup -> worker: the user has made a call on this site. */
  | { type: 'MARK_SITE'; url: string; verdict: 'phishing' | 'safe' }
  /** Popup -> worker: undo a previous call. */
  | { type: 'UNMARK_SITE'; hostname: string }
  /** Options -> worker: refresh the phishing feed now. */
  | { type: 'REFRESH_FEED' }
  /** Report page -> worker: gather everything you can about this site. */
  | { type: 'BUILD_REPORT'; url: string }
  /** Content script -> worker: open the full report for this page. */
  | { type: 'OPEN_REPORT'; url: string }
  /** Worker -> content script: bring Iris onto the page, or take her away. */
  | { type: 'SHOW_COMPANION'; verdict: Verdict }
  | { type: 'HIDE_COMPANION' }
  /** Popup -> content script: report your signals again, right now. */
  | { type: 'RESCAN' };

export type Response =
  | { ok: true; verdict: Verdict }
  | { ok: true; report: SiteReport }
  | { ok: true; feedCount: number; updatedAt: number }
  | { ok: true }
  | { ok: false; error: string };

export function send<T = Response>(msg: Message): Promise<T> {
  return chrome.runtime.sendMessage(msg) as Promise<T>;
}
