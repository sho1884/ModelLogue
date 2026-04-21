// Tiny clipboard helper. Returns a Promise that resolves on success and
// rejects on error so callers can show a short toast/indicator.

export async function copyToClipboard(text: string): Promise<void> {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for environments without the async clipboard API
  // (older browsers, non-secure contexts).
  fallbackCopyText(text);
}

/**
 * Copy a payload to the clipboard with TWO representations at once:
 *   - text/html  → Excel / Sheets / Numbers / Word import as a real table
 *   - text/plain → fallback for plain-text consumers (TSV recommended)
 *
 * Modern browsers expose the ClipboardItem API for this. Where that API
 * is missing we degrade to a plain-text-only copy of `plain`.
 */
export async function copyHtmlAndText(
  html: string,
  plain: string
): Promise<void> {
  const ClipboardItemCtor =
    typeof window !== 'undefined'
      ? (window as unknown as { ClipboardItem?: typeof ClipboardItem })
          .ClipboardItem
      : undefined;

  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof (
      navigator.clipboard as Clipboard & {
        write?: (items: ClipboardItem[]) => Promise<void>;
      }
    ).write === 'function' &&
    ClipboardItemCtor
  ) {
    const item = new ClipboardItemCtor({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([plain], { type: 'text/plain' }),
    });
    await (
      navigator.clipboard as Clipboard & {
        write: (items: ClipboardItem[]) => Promise<void>;
      }
    ).write([item]);
    return;
  }

  // Fallback: plain text only.
  await copyToClipboard(plain);
}

function fallbackCopyText(text: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    const ok = document.execCommand('copy');
    if (!ok) throw new Error('execCommand copy failed');
  } finally {
    document.body.removeChild(textarea);
  }
}
