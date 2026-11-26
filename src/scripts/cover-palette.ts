/**
 * Dynamic Cover-Driven Adaptive Page Palette (随封面取色):
 * - Runs on Post & SinglePage when enabled (html[data-cover-palette="true"])
 * - Priority: per-page manual `mote/accent_color` annotation > automatic 48x48 Canvas
 *   quantized HSL extraction from cover image > global site palette fallback
 * - WCAG AA contrast-normalized separately for Light (#ffffff) & Dark (#141414) surfaces
 * - Zero external dependencies, CORS-safe, session-cached, and Swup teardown safe
 */

import { PALETTE_EVENT } from "./palette";
import { SCHEME_EVENT } from "./scheme";

export const COVER_PALETTE_EVENT = "mote:cover-palette";

const LIGHT_BASE_RGB: [number, number, number] = [255, 255, 255];
const DARK_BASE_RGB: [number, number, number] = [20, 20, 20];
const STORAGE_KEY = "mote-cover-palette-v1";
const MAX_CACHED_ENTRIES = 48;

interface AdaptivePalette {
  primaryLight: string;
  primaryDark: string;
  secondaryLight: string;
  secondaryDark: string;
  themeLight: string;
  themeDark: string;
}

const paletteCache = new Map<string, AdaptivePalette | null>();
let activePalette: AdaptivePalette | null = null;
let themeColorListenersBound = false;
let storageLoaded = false;

function hydrateStorageCache() {
  if (storageLoaded) return;
  storageLoaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, AdaptivePalette>;
    if (!parsed || typeof parsed !== "object") return;
    for (const [k, v] of Object.entries(parsed)) {
      if (v && typeof v.primaryLight === "string" && typeof v.themeLight === "string") {
        paletteCache.set(k, v);
      }
    }
  } catch {
    /* Storage is optional. */
  }
}

function persistPaletteCache(url: string, palette: AdaptivePalette | null) {
  paletteCache.set(url, palette);
  if (!palette) return;
  try {
    const entries: Array<[string, AdaptivePalette]> = [];
    for (const [k, v] of paletteCache.entries()) {
      if (v) entries.push([k, v]);
    }
    const trimmed = entries.slice(-MAX_CACHED_ENTRIES);
    const obj: Record<string, AdaptivePalette> = {};
    for (const [k, v] of trimmed) obj[k] = v;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    /* Storage quota or privacy mode. */
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [
    Math.round(clamp((r + m) * 255, 0, 255)),
    Math.round(clamp((g + m) * 255, 0, 255)),
    Math.round(clamp((b + m) * 255, 0, 255)),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function hslToHex(h: number, s: number, l: number): string {
  const [r, g, b] = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

function mixHexWithBase(
  hex: string,
  baseRgb: [number, number, number],
  ratio: number,
): string {
  const fg = parseHexColor(hex);
  if (!fg) return rgbToHex(baseRgb[0], baseRgb[1], baseRgb[2]);
  const r = baseRgb[0] + (fg[0] - baseRgb[0]) * ratio;
  const g = baseRgb[1] + (fg[1] - baseRgb[1]) * ratio;
  const b = baseRgb[2] + (fg[2] - baseRgb[2]) * ratio;
  return rgbToHex(r, g, b);
}

function relLuminance(r: number, g: number, b: number): number {
  const lin = (v: number) => {
    const n = v / 255;
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastWith(r: number, g: number, b: number, bgLum: number): number {
  const lum = relLuminance(r, g, b);
  return (Math.max(lum, bgLum) + 0.05) / (Math.min(lum, bgLum) + 0.05);
}

function parseHexColor(raw: string): [number, number, number] | null {
  const cleaned = raw.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(cleaned)) {
    const r = Number.parseInt(cleaned[0] + cleaned[0], 16);
    const g = Number.parseInt(cleaned[1] + cleaned[1], 16);
    const b = Number.parseInt(cleaned[2] + cleaned[2], 16);
    return [r, g, b];
  }
  if (/^[0-9a-f]{6}$/i.test(cleaned)) {
    const r = Number.parseInt(cleaned.slice(0, 2), 16);
    const g = Number.parseInt(cleaned.slice(2, 4), 16);
    const b = Number.parseInt(cleaned.slice(4, 6), 16);
    return [r, g, b];
  }
  return null;
}

/** Normalize raw primary + optional secondary hue/sat into WCAG AA-legible Mote tokens. */
function buildEditorialPalette(
  pHue: number,
  pSat: number,
  sHue?: number,
  sSat?: number,
): AdaptivePalette {
  const lightS = clamp(pSat, 0.38, 0.7);
  let lightL = 0.42;
  // Guarantee >= 4.6:1 contrast on #ffffff (luminance 1.0) across all 360° hues
  while (lightL > 0.2) {
    const [r, g, b] = hslToRgb(pHue, lightS, lightL);
    if (contrastWith(r, g, b, 1) >= 4.6) break;
    lightL -= 0.02;
  }

  const darkS = clamp(pSat, 0.42, 0.76);
  let darkL = 0.66;
  // Guarantee >= 5.2:1 contrast on #141414 (luminance ~0.007)
  const darkBgLum = relLuminance(20, 20, 20);
  while (darkL < 0.82) {
    const [r, g, b] = hslToRgb(pHue, darkS, darkL);
    if (contrastWith(r, g, b, darkBgLum) >= 5.2) break;
    darkL += 0.02;
  }

  const secHue = sHue ?? (pHue + 34) % 360;
  const secSat = clamp(sSat ?? pSat * 0.85, 0.34, 0.62);
  const primaryLight = hslToHex(pHue, lightS, lightL);
  const primaryDark = hslToHex(pHue, darkS, darkL);

  return {
    primaryLight,
    primaryDark,
    secondaryLight: hslToHex(secHue, secSat, 0.68),
    secondaryDark: hslToHex(secHue, clamp(secSat, 0.38, 0.66), 0.72),
    themeLight: mixHexWithBase(primaryLight, LIGHT_BASE_RGB, 0.12),
    themeDark: mixHexWithBase(primaryDark, DARK_BASE_RGB, 0.16),
  };
}

function paletteFromHex(hex: string): AdaptivePalette | null {
  const rgb = parseHexColor(hex);
  if (!rgb) return null;
  const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  if (s < 0.08) {
    const primaryLight = hslToHex(h, 0.06, clamp(l, 0.16, 0.36));
    const primaryDark = hslToHex(h, 0.08, 0.78);
    return {
      primaryLight,
      primaryDark,
      secondaryLight: "#b8c0cc",
      secondaryDark: "#94a3b8",
      themeLight: mixHexWithBase(primaryLight, LIGHT_BASE_RGB, 0.08),
      themeDark: mixHexWithBase(primaryDark, DARK_BASE_RGB, 0.1),
    };
  }
  return buildEditorialPalette(h, s);
}

function extractFromImageElement(img: HTMLImageElement): AdaptivePalette | null {
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  let data: Uint8ClampedArray;
  try {
    ctx.drawImage(img, 0, 0, size, size);
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    // Tainted canvas (cross-origin cover without CORS headers) — silently fall back
    return null;
  }

  const BINS = 24;
  const binScore = new Float64Array(BINS);
  const binHueSin = new Float64Array(BINS);
  const binHueCos = new Float64Array(BINS);
  const binSatSum = new Float64Array(BINS);
  const binWeight = new Float64Array(BINS);

  let validPixels = 0;
  let chromaticPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 180) continue;
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    if (l < 0.07 || l > 0.94) continue;
    validPixels += 1;
    if (s < 0.12) continue;

    chromaticPixels += 1;
    const idx = Math.floor(h / (360 / BINS)) % BINS;
    const midLWeight = 1 - Math.abs(l - 0.5) * 1.15;
    const w = (0.3 + Math.pow(s, 1.35)) * Math.max(0.12, midLWeight);
    const rad = (h * Math.PI) / 180;

    binScore[idx] += w;
    binHueSin[idx] += Math.sin(rad) * w;
    binHueCos[idx] += Math.cos(rad) * w;
    binSatSum[idx] += s * w;
    binWeight[idx] += w;
  }

  // Monochrome / ultra-low-saturation photograph: keep site default cleanly
  if (validPixels < 20 || chromaticPixels / validPixels < 0.06) {
    return null;
  }

  let primaryIdx = -1;
  let maxScore = 0;
  for (let i = 0; i < BINS; i++) {
    if (binScore[i] > maxScore) {
      maxScore = binScore[i];
      primaryIdx = i;
    }
  }
  if (primaryIdx === -1 || binWeight[primaryIdx] <= 0) return null;

  const avgHue = (idx: number) => {
    const deg =
      (Math.atan2(binHueSin[idx], binHueCos[idx]) * 180) / Math.PI;
    return (deg + 360) % 360;
  };

  const pHue = avgHue(primaryIdx);
  const pSat = binSatSum[primaryIdx] / binWeight[primaryIdx];

  // Pick a complementary/analogous secondary hue at least 40° away if strongly present
  let secondaryIdx = -1;
  let secondaryScore = 0;
  for (let i = 0; i < BINS; i++) {
    if (binWeight[i] <= 0) continue;
    const candHue = avgHue(i);
    const rawDiff = Math.abs(candHue - pHue);
    const hueDist = Math.min(rawDiff, 360 - rawDiff);
    if (hueDist < 40) continue;
    if (binScore[i] > secondaryScore) {
      secondaryScore = binScore[i];
      secondaryIdx = i;
    }
  }

  const hasStrongSecondary =
    secondaryIdx !== -1 && secondaryScore >= maxScore * 0.22;
  const sHue = hasStrongSecondary ? avgHue(secondaryIdx) : undefined;
  const sSat = hasStrongSecondary
    ? binSatSum[secondaryIdx] / binWeight[secondaryIdx]
    : undefined;

  return buildEditorialPalette(pHue, pSat, sHue, sSat);
}

function isSameOriginUrl(url: string): boolean {
  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

function buildColorApiUrl(template: string, coverUrl: string): string | null {
  const tpl = template.trim();
  if (!tpl) return null;
  try {
    const absCover = new URL(coverUrl, location.href).href;
    if (tpl.includes("{url}")) {
      return tpl.replaceAll("{url}", encodeURIComponent(absCover));
    }
    if (tpl.startsWith("?") || tpl.startsWith("&")) {
      const sep = absCover.includes("?") ? "&" : "?";
      return `${absCover}${sep}${tpl.slice(1)}`;
    }
    const sep = absCover.includes("?") ? "&" : "?";
    return `${absCover}${sep}${tpl}`;
  } catch {
    return null;
  }
}

async function extractPaletteFromApi(
  coverUrl: string,
  apiTemplate: string,
): Promise<AdaptivePalette | null> {
  const endpoint = buildColorApiUrl(apiTemplate, coverUrl);
  if (!endpoint) return null;
  try {
    const res = await fetch(endpoint, { mode: "cors", credentials: "omit" });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const rawColor =
      (typeof data.RGB === "string" && data.RGB) ||
      (typeof data.rgb === "string" && data.rgb) ||
      (typeof data.color === "string" && data.color) ||
      (typeof data.hex === "string" && data.hex) ||
      "";
    if (!rawColor) return null;
    const normalized = rawColor.trim().replace(/^0x/i, "#");
    return paletteFromHex(normalized);
  } catch {
    return null;
  }
}

async function extractPaletteFromUrl(
  url: string,
  domCoverImg: HTMLImageElement | null,
  apiTemplate: string,
): Promise<AdaptivePalette | null> {
  hydrateStorageCache();
  if (paletteCache.has(url)) {
    return paletteCache.get(url) ?? null;
  }

  const sameOrigin = isSameOriginUrl(url);

  // Fast path: reuse already-decoded same-origin DOM cover image with zero extra request
  if (
    sameOrigin &&
    domCoverImg &&
    domCoverImg.complete &&
    domCoverImg.naturalWidth > 0
  ) {
    const extracted = extractFromImageElement(domCoverImg);
    persistPaletteCache(url, extracted);
    return extracted;
  }

  const extracted = await new Promise<AdaptivePalette | null>((resolve) => {
    const probe = new Image();
    if (!sameOrigin) {
      probe.crossOrigin = "anonymous";
    }
    probe.decoding = "async";
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      const result =
        ok && probe.naturalWidth > 0 ? extractFromImageElement(probe) : null;
      resolve(result);
    };
    probe.onload = () => finish(true);
    probe.onerror = () => finish(false);
    probe.src = url;
    if (probe.complete && probe.naturalWidth > 0) finish(true);
  });

  if (extracted) {
    persistPaletteCache(url, extracted);
    return extracted;
  }
  // Fallback: optional cloud CDN average-hue API (e.g. ?imageAve) for CORS-restricted external hosts
  if (apiTemplate) {
    const apiExtracted = await extractPaletteFromApi(url, apiTemplate);
    persistPaletteCache(url, apiExtracted);
    return apiExtracted;
  }
  paletteCache.set(url, null);
  return null;
}

function syncThemeColor() {
  const root = document.documentElement;
  const isDark = root.classList.contains("dark");
  const palette = activePalette;
  const coverActive =
    palette !== null &&
    root.dataset.coverPaletteActive === "true" &&
    root.dataset.coverPaletteOverride !== "true";

  const nextColor =
    coverActive && palette
      ? isDark
        ? palette.themeDark
        : palette.themeLight
      : isDark
        ? "#141414"
        : "#ffffff";

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
  }
  if (meta.getAttribute("content") !== nextColor) {
    meta.setAttribute("content", nextColor);
  }
}

function ensureThemeColorSync() {
  if (themeColorListenersBound) return;
  themeColorListenersBound = true;
  document.addEventListener(SCHEME_EVENT, syncThemeColor);
  document.addEventListener(PALETTE_EVENT, syncThemeColor);
  document.addEventListener(COVER_PALETTE_EVENT, syncThemeColor);
}

function applyPagePalette(palette: AdaptivePalette) {
  const root = document.documentElement;
  activePalette = palette;
  root.style.setProperty("--page-primary", palette.primaryLight);
  root.style.setProperty("--page-primary-dark", palette.primaryDark);
  root.style.setProperty("--page-secondary", palette.secondaryLight);
  root.style.setProperty("--page-secondary-dark", palette.secondaryDark);
  root.dataset.coverPaletteActive = "true";
  syncThemeColor();
  document.dispatchEvent(new CustomEvent(COVER_PALETTE_EVENT));
}

export function clearPagePalette() {
  const root = document.documentElement;
  const wasActive = root.dataset.coverPaletteActive === "true";
  activePalette = null;
  delete root.dataset.coverPaletteActive;
  delete root.dataset.coverPaletteOverride;
  root.style.removeProperty("--page-primary");
  root.style.removeProperty("--page-primary-dark");
  root.style.removeProperty("--page-secondary");
  root.style.removeProperty("--page-secondary-dark");
  syncThemeColor();
  if (wasActive) {
    document.dispatchEvent(new CustomEvent(COVER_PALETTE_EVENT));
  }
}

export function initCoverPalette(): () => void {
  ensureThemeColorSync();
  const root = document.documentElement;
  delete root.dataset.coverPaletteOverride;
  if (root.dataset.coverPalette === "false") {
    clearPagePalette();
    return () => {};
  }

  const host = document.querySelector<HTMLElement>(
    "[data-cover-palette-src], [data-cover-palette-accent]",
  );
  if (!host) {
    clearPagePalette();
    return () => {};
  }

  let cancelled = false;
  const manualHex = (host.dataset.coverPaletteAccent ?? "").trim();
  const coverSrc = (host.dataset.coverPaletteSrc ?? "").trim();

  // Priority 1: per-post / per-page manual accent color annotation
  if (manualHex) {
    const manualPalette = paletteFromHex(manualHex);
    if (manualPalette) {
      applyPagePalette(manualPalette);
      return () => {
        cancelled = true;
        clearPagePalette();
      };
    }
  }

  // Priority 2: automatic Canvas color extraction (with instant localStorage cache + optional CDN API fallback)
  if (coverSrc) {
    hydrateStorageCache();
    const cached = paletteCache.get(coverSrc);
    if (cached) {
      applyPagePalette(cached);
      return () => {
        cancelled = true;
        clearPagePalette();
      };
    }
    const domCoverImg = host.querySelector<HTMLImageElement>(
      ".article-cover img",
    );
    const apiTemplate = (root.dataset.coverPaletteApi ?? "").trim();
    void extractPaletteFromUrl(coverSrc, domCoverImg, apiTemplate).then(
      (extracted) => {
        if (cancelled) return;
        if (extracted) applyPagePalette(extracted);
        else clearPagePalette();
      },
    );
  } else {
    clearPagePalette();
  }

  return () => {
    cancelled = true;
    clearPagePalette();
  };
}
