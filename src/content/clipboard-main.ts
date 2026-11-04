/**
 * ClickFix guard. Runs in the page's own JavaScript world (manifest
 * `world: "MAIN"`), because that is the only place a page's clipboard writes
 * can be seen before they happen.
 *
 * A ClickFix page shows a fake CAPTCHA or error, copies a command to the
 * clipboard when you click, and tells you to press Win+R, paste and Enter.
 * This watches the three ways a page can write the clipboard. When the text is
 * a command AND the page is telling you to run it, the command is swapped for
 * a warning, so pasting it runs nothing. Every other copy passes through
 * untouched, which is why a developer docs page that copies `curl … | sh`
 * still works: it does not tell you to open Win+R to "verify you are human".
 *
 * It only reports to Pagida's own content script, through a window message the
 * page could also send. That is fine: the worst a page can do with a forged
 * message is get itself flagged.
 */
import { isClickFix, looksLikeCommand, normaliseCommand } from '../core/lures.js';

const WARNING = 'Pagida stopped this: the page tried to make you run a command on your computer. Do not paste anything it asks you to. Close the page.';

function pageText(): string {
  try { return (document.body?.innerText ?? '').slice(0, 20_000); } catch { return ''; }
}

/** Report, and say whether to block. */
function inspect(text: unknown): boolean {
  if (typeof text !== 'string' || text.length < 6) return false;
  const clean = normaliseCommand(text);
  if (!looksLikeCommand(clean)) return false;
  const block = isClickFix(clean, pageText());
  try {
    window.postMessage({ source: 'pagida-clipboard', text: clean.slice(0, 300), blocked: block }, '*');
  } catch { /* never break the page */ }
  return block;
}

try {
  const clip = navigator.clipboard;
  if (clip && typeof clip.writeText === 'function') {
    const original = clip.writeText.bind(clip);
    Object.defineProperty(clip, 'writeText', {
      configurable: true,
      value: (data: string) => original(inspect(data) ? WARNING : data),
    });
  }
  if (clip && typeof clip.write === 'function' && typeof ClipboardItem !== 'undefined') {
    const originalWrite = clip.write.bind(clip);
    Object.defineProperty(clip, 'write', {
      configurable: true,
      value: async (items: ClipboardItem[]) => {
        try {
          for (const item of items ?? []) {
            if (!item.types.includes('text/plain')) continue;
            const text = await (await item.getType('text/plain')).text();
            if (inspect(text)) {
              return originalWrite([new ClipboardItem({ 'text/plain': new Blob([WARNING], { type: 'text/plain' }) })]);
            }
          }
        } catch { /* fall through to the page's own write */ }
        return originalWrite(items);
      },
    });
  }

  // execCommand('copy') copies the current selection, usually from a hidden textarea.
  const originalExec = document.execCommand.bind(document);
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: (command: string, showUI?: boolean, value?: string) => {
      if (String(command).toLowerCase() === 'copy') {
        const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
        const selected = active && 'value' in active && typeof active.selectionStart === 'number'
          ? active.value.slice(active.selectionStart ?? 0, active.selectionEnd ?? active.value.length)
          : String(window.getSelection() ?? '');
        if (inspect(selected)) {
          const swap = (e: ClipboardEvent) => { e.clipboardData?.setData('text/plain', WARNING); e.preventDefault(); };
          document.addEventListener('copy', swap, { capture: true, once: true });
        }
      }
      return originalExec(command, showUI, value);
    },
  });

  // A copy handler that sets the data itself.
  const originalSetData = DataTransfer.prototype.setData;
  DataTransfer.prototype.setData = function (format: string, data: string) {
    if (/text/i.test(format) && inspect(data)) return originalSetData.call(this, format, WARNING);
    return originalSetData.call(this, format, data);
  };
} catch {
  // A page that has frozen these objects keeps its own behaviour.
}
