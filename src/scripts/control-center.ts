/**
 * Control center: opened from the header button, the context menu or Shift + A.
 * Coordinates appearance mode (light/dark/auto), accent palette, typography
 * (font/size), rain & motion toggles, preference reset, and quick shortcuts.
 */
import { openRandomPost, openSearch } from "./actions";
import { resetAmbientPreset } from "./ambient-audio";
import { COVER_PALETTE_EVENT } from "./cover-palette";
import { MOTION_EVENT } from "./motion";
import {
  PALETTE_EVENT,
  currentPalette,
  isPalette,
  setPalette,
} from "./palette";
import {
  SCHEME_EVENT,
  currentSchemeMode,
  setScheme,
  type SchemeMode,
} from "./scheme";
import { createOverlay, type Overlay } from "./overlay";
import { OPEN_FOOTPRINTS_EVENT } from "./footprints";
import { toast } from "./toast";

export function initControlCenter(showShortcuts: () => void): Overlay | null {
  const root = document.querySelector<HTMLElement>("[data-cc]");
  if (!root) return null;
  const overlay = createOverlay(root);

  document
    .querySelectorAll<HTMLElement>("[data-cc-open]")
    .forEach((button) =>
      button.addEventListener("click", () => overlay.toggle(button)),
    );

  // 1. Appearance Mode (Light / Dark / Auto)
  const schemeBtns = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-scheme-pick]"),
  );
  const syncSchemeBtns = () => {
    const mode = currentSchemeMode();
    schemeBtns.forEach((btn) => {
      const active = btn.dataset.schemePick === mode;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-checked", String(active));
    });
  };
  schemeBtns.forEach((btn) =>
    btn.addEventListener("click", (event) => {
      const pick = btn.dataset.schemePick as SchemeMode | undefined;
      if (pick === "light" || pick === "dark" || pick === "auto") {
        setScheme(pick, false, event);
      }
    }),
  );
  document.addEventListener(SCHEME_EVENT, syncSchemeBtns);
  syncSchemeBtns();

  // 2. Accent Palette Swatches + Live Label
  const swatches = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-palette-pick]"),
  );
  const paletteLabel = root.querySelector<HTMLElement>("[data-palette-label]");
  const syncSwatches = () => {
    const docRoot = document.documentElement;
    const coverOnPage =
      docRoot.dataset.coverPaletteActive === "true" &&
      docRoot.dataset.coverPaletteOverride !== "true";
    const active = coverOnPage ? "custom" : currentPalette();
    let activeName = coverOnPage ? "随封面取色" : "站点默认";
    swatches.forEach((swatch) => {
      const matched = swatch.dataset.palettePick === active;
      swatch.setAttribute("aria-checked", String(matched));
      if (matched) {
        if (swatch.dataset.palettePick === "custom" && coverOnPage) {
          activeName = "随封面取色";
        } else if (swatch.dataset.paletteName) {
          activeName = swatch.dataset.paletteName;
        }
      }
    });
    if (paletteLabel) paletteLabel.textContent = activeName;
  };
  swatches.forEach((swatch) =>
    swatch.addEventListener("click", () => {
      const pick = swatch.dataset.palettePick;
      if (!isPalette(pick)) return;
      const docRoot = document.documentElement;
      const isDefaultSlot = pick === docRoot.dataset.paletteDefault;
      if (docRoot.dataset.coverPaletteActive === "true") {
        if (isDefaultSlot) delete docRoot.dataset.coverPaletteOverride;
        else docRoot.dataset.coverPaletteOverride = "true";
      }
      setPalette(isDefaultSlot ? null : pick);
      const isCoverDefault =
        isDefaultSlot && docRoot.dataset.coverPaletteActive === "true";
      toast(
        `强调色：${isCoverDefault ? "随封面取色" : (swatch.dataset.paletteName ?? pick)}`,
        "info",
      );
    }),
  );
  document.addEventListener(PALETTE_EVENT, syncSwatches);
  document.addEventListener(COVER_PALETTE_EVENT, syncSwatches);
  syncSwatches();

  // 3. Reset Preferences to Site Defaults
  const resetBtn = root.querySelector<HTMLButtonElement>("[data-cc-reset]");
  resetBtn?.addEventListener("click", (event) => {
    delete document.documentElement.dataset.coverPaletteOverride;
    setScheme(null, true, event);
    setPalette(null);
    delete document.documentElement.dataset.motion;
    try {
      localStorage.removeItem("mote-motion");
      localStorage.removeItem("mote-prose-font");
      localStorage.removeItem("mote-prose-size");
    } catch {
      /* Storage is optional. */
    }
    delete document.documentElement.dataset.proseFont;
    delete document.documentElement.dataset.proseSize;
    resetAmbientPreset();
    document.dispatchEvent(new CustomEvent(MOTION_EVENT));
    document.dispatchEvent(new CustomEvent("mote:reader-sync"));
    toast("已恢复默认阅读偏好", "success");
  });

  // 4. Compact Footer Shortcuts
  const actions: Record<string, () => void> = {
    random: () => {
      overlay.close();
      if (!openRandomPost()) toast("还没有其他文章");
    },
    footprints: () => {
      overlay.close();
      document.dispatchEvent(new CustomEvent(OPEN_FOOTPRINTS_EVENT));
    },
    search: () => {
      overlay.close();
      openSearch();
    },
    shortcuts: () => {
      overlay.close();
      showShortcuts();
    },
  };
  root.addEventListener("click", (event) => {
    const tile = (event.target as Element).closest<HTMLElement>(
      "[data-action]",
    );
    if (tile) actions[tile.dataset.action ?? ""]?.();
  });

  return overlay;
}
