// Browser file download helpers. Used by SR-041 (whole-session JSON),
// SR-100 (PlantUML source), SR-101 (matrix CSV).

export function downloadTextFile(
  filename: string,
  contents: string,
  mimeType: string
): void {
  const blob = new Blob([contents], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function timestamp(): string {
  const d = new Date();
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}`
  );
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'session'
  );
}

/**
 * Build a filename like:
 *   modellogue-<sessionSlug>[-<suffix>]-<YYYY-MM-DD-HHMM>.<ext>
 */
export function sessionFilename(
  sessionName: string,
  suffix: string,
  extension: string
): string {
  const slug = slugify(sessionName);
  const stem = suffix ? `${slug}-${suffix}` : slug;
  return `modellogue-${stem}-${timestamp()}.${extension}`;
}
