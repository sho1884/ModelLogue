// PlantUML Server service: encode source and fetch SVG

import plantumlEncoder from 'plantuml-encoder';

const PLANTUML_SERVER_URL =
  import.meta.env.VITE_PLANTUML_SERVER_URL ?? 'http://localhost:8080';

export function encodePlantUml(source: string): string {
  return plantumlEncoder.encode(source);
}

export async function fetchSvg(source: string): Promise<string> {
  const encoded = encodePlantUml(source);
  const url = `${PLANTUML_SERVER_URL}/svg/${encoded}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`PlantUML Server error: ${response.status}`);
  }
  return response.text();
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${PLANTUML_SERVER_URL}/svg/SoWkIImgAStDuNBAJrBGjLDmpCbCJbMmKiX8pSd9vt98pKi1IW80`);
    return response.ok;
  } catch {
    return false;
  }
}
