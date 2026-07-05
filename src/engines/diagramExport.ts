// Export the model diagram (the PlantUML SVG shown on the canvas) as a file.
// Only the diagram itself is exported — review markers are a volatile,
// working-only overlay and are deliberately left out.

export interface PixelSize {
  width: number;
  height: number;
}

const FALLBACK: PixelSize = { width: 400, height: 300 };

/**
 * Read the diagram's pixel size from an SVG string: prefer the width/height
 * attributes, fall back to the viewBox, then to a sane default (mirrors the
 * logic DiagramView uses to size the canvas).
 */
export function readSvgPixelSize(svgString: string): PixelSize {
  const svg = new DOMParser()
    .parseFromString(svgString, 'image/svg+xml')
    .querySelector('svg');
  const dim = (attr: 'width' | 'height'): number => {
    const attrVal = svg?.getAttribute(attr) ?? '';
    // Accept plain numbers or px (e.g. "240", "240px"), but not relative units
    // like "100%" — parseFloat("100%") is 100, a wrong pixel size, so fall back
    // to the viewBox in that case.
    const raw = attrVal.includes('%') ? NaN : parseFloat(attrVal);
    if (Number.isFinite(raw) && raw > 0) return raw;
    const vb = svg?.getAttribute('viewBox');
    if (vb) {
      const parts = vb.split(/\s+/).map(parseFloat);
      const fromVb = parts[attr === 'width' ? 2 : 3];
      if (Number.isFinite(fromVb) && fromVb > 0) return fromVb;
    }
    return attr === 'width' ? FALLBACK.width : FALLBACK.height;
  };
  return { width: dim('width'), height: dim('height') };
}

/** Return the SVG with explicit width/height attributes (so an <img> has an
 *  intrinsic size to rasterize, even when the source used width="100%"). */
export function withExplicitSize(svgString: string, size: PixelSize): string {
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) return svgString;
  svg.setAttribute('width', String(size.width));
  svg.setAttribute('height', String(size.height));
  return new XMLSerializer().serializeToString(doc);
}

/**
 * Rasterize an SVG string to a PNG Blob at `scale`× the nominal size (2× by
 * default for crisp output). Paints a white background so the PNG isn't
 * transparent when pasted into docs/slides.
 */
export function svgToPngBlob(svgString: string, scale = 2): Promise<Blob> {
  const size = readSvgPixelSize(svgString);
  const normalized = withExplicitSize(svgString, size);
  const url = URL.createObjectURL(new Blob([normalized], { type: 'image/svg+xml' }));

  return new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(size.width * scale));
        canvas.height = Math.max(1, Math.round(size.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas 2D context unavailable');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('canvas.toBlob returned null'));
        }, 'image/png');
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('failed to load SVG for rasterization'));
    };
    img.src = url;
  });
}
