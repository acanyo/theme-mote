/**
 * Theme accents. The site default comes from theme settings
 * (data-palette-default); a visitor override is kept in localStorage and
 * applied before first paint by the inline script in Layout.astro.
 */
const PALETTES = ["custom", "clear", "sky", "lagoon", "dusk", "ink"] as const;
export type Palette = (typeof PALETTES)[number];
const PALETTE_KEY = "mote-palette";
export const PALETTE_EVENT = "mote:palette";

const root = document.documentElement;

export function isPalette(value: unknown): value is Palette {
  return PALETTES.includes(value as Palette);
}

/** Visitor palette override; `null` returns to the site's backend primary/secondary colors. */
export function setPalette(palette: Palette | null) {
  root.dataset.palette = palette ?? root.dataset.paletteDefault ?? "custom";
  try {
    if (palette) localStorage.setItem(PALETTE_KEY, palette);
    else localStorage.removeItem(PALETTE_KEY);
  } catch {
    /* storage unavailable: lasts for this page only */
  }
  document.dispatchEvent(new CustomEvent(PALETTE_EVENT));
}

export function currentPalette(): Palette {
  const value = root.dataset.palette;
  return isPalette(value) ? value : "custom";
}
