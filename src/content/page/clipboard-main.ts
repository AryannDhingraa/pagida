/**
 * ClickFix guard. Runs in the page's own JavaScript world (manifest
 * `world: "MAIN"`), because that is the only place a page's clipboard writes
 * can be seen before they happen.
 *
 * A ClickFix page shows a fake CAPTCHA or error, copies a command to the
 * clipboard when you click, and tells you to press Win+R, paste and Enter.
 * This watches the ways a page can write the clipboard. When the text is a
 * command AND the page is telling you to run it, the command is swapped for a
 * warning, so pasting it runs nothing. Every other copy passes through
 * untouched, which is why a developer docs page that copies `curl … | sh`
 * still works: it does not tell you to open Win+R to "verify you are human".
 *
 * Frames. A page can borrow a clean clipboard from a frame it creates, so the
 * guard covers frames two ways: the manifest runs this script in every frame
 * (including about:blank ones), and reaching for a frame's window from here
 * guards that window first, which closes the gap before a brand-new frame's
 * own copy of this script has started.
 *
 * It only reports to Pagida's own content script, through a window message the
 * page could also send. That is fine: a forged message can add a command to
 * what Pagida saw, never take one away (see `noteClipboard`).
 */
import { isClickFix, looksLikeCommand, normaliseCommand } from '../../core/lures.js';

const WARNING = 'Pagida stopped this: the page tried to make you run a command on your computer. Do not paste anything it asks you to. Close the page.';

type Win = Window & typeof globalThis;

/** The top window when this frame may read it, otherwise this frame. */
function reachableTop(): Window {
  try {
    const top = window.top;
    if (top && top.document) return top;
  } catch { /* a frame from another site: stay in this one */ }
  return window;
}

/** The instructions sit on the page the person is looking at, not in a hidden frame. */
function pageText(): string {
  try { return (reachableTop().document.body?.innerText ?? '').slice(0, 20_000); } catch { return ''; }
}

/** Report, and say whether to block. */
function inspect(text: unknown): boolean {
  if (typeof text !== 'string' || text.length < 6) return false;
  const clean = normaliseCommand(text);
  if (!looksLikeCommand(clean)) return false;
  const block = isClickFix(clean, pageText());
  try {
    reachableTop().postMessage({ source: 'pagida-clipboard', text: clean.slice(0, 300), blocked: block }, '*');
  } catch { /* never break the page */ }
  return block;
}

const guarded = new WeakSet<object>();

function guard(w: Win): void {
  if (guarded.has(w)) return;
  guarded.add(w);
  try {
    const doc = w.document;
    const clip = w.navigator.clipboard;
    if (clip && typeof clip.writeText === 'function') {
      const original = clip.writeText.bind(clip);
      Object.defineProperty(clip, 'writeText', {
        configurable: true,
        value: (data: string) => original(inspect(data) ? WARNING : data),
      });
    }
    if (clip && typeof clip.write === 'function' && typeof w.ClipboardItem !== 'undefined') {
      const originalWrite = clip.write.bind(clip);
      Object.defineProperty(clip, 'write', {
        configurable: true,
        value: async (items: ClipboardItem[]) => {
          try {
            for (const item of items ?? []) {
              if (!item.types.includes('text/plain')) continue;
              const text = await (await item.getType('text/plain')).text();
              if (inspect(text)) {
                return originalWrite([new w.ClipboardItem({ 'text/plain': new w.Blob([WARNING], { type: 'text/plain' }) })]);
              }
            }
          } catch { /* fall through to the page's own write */ }
          return originalWrite(items);
        },
      });
    }

    // execCommand('copy') copies the current selection, usually from a hidden textarea.
    const originalExec = doc.execCommand.bind(doc);
    Object.defineProperty(doc, 'execCommand', {
      configurable: true,
      value: (command: string, showUI?: boolean, value?: string) => {
        if (String(command).toLowerCase() === 'copy') {
          const active = doc.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
          const selected = active && 'value' in active && typeof active.selectionStart === 'number'
            ? active.value.slice(active.selectionStart ?? 0, active.selectionEnd ?? active.value.length)
            : String(w.getSelection() ?? '');
          if (inspect(selected)) {
            const swap = (e: ClipboardEvent) => { e.clipboardData?.setData('text/plain', WARNING); e.preventDefault(); };
            doc.addEventListener('copy', swap, { capture: true, once: true });
          }
        }
        return originalExec(command, showUI, value);
      },
    });

    // A copy handler that sets the data itself.
    const originalSetData = w.DataTransfer.prototype.setData;
    w.DataTransfer.prototype.setData = function (format: string, data: string) {
      if (/text/i.test(format) && inspect(data)) return originalSetData.call(this, format, WARNING);
      return originalSetData.call(this, format, data);
    };

    // Reaching into a frame guards it first. A frame from another site throws
    // inside guard() and is left alone: it gets its own copy of this script.
    for (const prop of ['contentWindow', 'contentDocument'] as const) {
      const desc = Object.getOwnPropertyDescriptor(w.HTMLIFrameElement.prototype, prop);
      const get = desc?.get;
      if (!desc || !get) continue;
      Object.defineProperty(w.HTMLIFrameElement.prototype, prop, {
        ...desc,
        get(this: HTMLIFrameElement) {
          const value = get.call(this) as Window | Document | null;
          try {
            const child = prop === 'contentWindow' ? value as Window | null : (value as Document | null)?.defaultView;
            if (child) guard(child as Win);
          } catch { /* never break the page */ }
          return value;
        },
      });
    }
  } catch {
    // A page that has frozen these objects, or a frame this one may not read,
    // keeps its own behaviour.
  }
}

guard(window);
