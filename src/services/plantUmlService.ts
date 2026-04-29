// PlantUML Server service: encode source and fetch SVG

import plantumlEncoder from 'plantuml-encoder';

const PLANTUML_SERVER_URL =
  import.meta.env.VITE_PLANTUML_SERVER_URL ?? 'http://localhost:8080';

export function encodePlantUml(source: string): string {
  return plantumlEncoder.encode(source);
}

export interface SvgFetchResult {
  /** SVG body — always present when the server responded; on errors this
   *  is PlantUML's own self-rendered error image, useful as a fallback
   *  if our parsed message extraction fails. */
  svg: string;
  /** Non-null when PlantUML rejected the source. The full message
   *  (including the offending line number) extracted from the error
   *  SVG, ready to display to the user. */
  errorMessage: string | null;
}

export async function fetchSvg(source: string): Promise<SvgFetchResult> {
  const encoded = encodePlantUml(source);
  const url = `${PLANTUML_SERVER_URL}/svg/${encoded}`;
  const response = await fetch(url);
  const svg = await response.text();
  if (response.ok) {
    return { svg, errorMessage: null };
  }
  return {
    svg,
    errorMessage: extractPlantUmlErrorMessage(svg, response.status),
  };
}

/** PlantUML returns a self-rendered SVG even on 400, with the error
 *  text in `<text fill="#FF0000">…</text>` and the offending line
 *  marker in `<text …>[From string (line N) ]</text>`. Pull both out
 *  so we can show a one-liner instead of "PlantUML Server error: 400".
 */
function extractPlantUmlErrorMessage(
  svg: string,
  status: number
): string {
  const lineMatch = svg.match(/\[From string \(line (\d+)\)\s*\]/);
  const errorMatches = Array.from(
    svg.matchAll(/<text[^>]*fill="#FF0000"[^>]*>([^<]+)<\/text>/g)
  );
  const errorText = errorMatches
    .map((m) => decodeXmlEntities(m[1]).trim())
    .filter((s) => s.length > 0)
    .join(' ');
  if (errorText) {
    return lineMatch
      ? `Line ${lineMatch[1]}: ${errorText}`
      : errorText;
  }
  return `PlantUML Server error: ${status}`;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#160;/g, ' ')
    .replace(/&nbsp;/g, ' ');
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${PLANTUML_SERVER_URL}/svg/SoWkIImgAStDuNBAJrBGjLDmpCbCJbMmKiX8pSd9vt98pKi1IW80`);
    return response.ok;
  } catch {
    return false;
  }
}
