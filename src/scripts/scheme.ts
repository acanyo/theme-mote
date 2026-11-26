/**
 * Keep the theme and Halo widgets on the same color scheme, with a silky
 * View Transitions API radial clip-path reveal radiating from the click point.
 */
import { motionAllowed } from "./motion";
import { toast } from "./toast";
import { refreshTooltip } from "./tooltip";

export type SchemeMode = "light" | "dark" | "auto";
export const SCHEME_EVENT = "mote:scheme";

const root = document.documentElement;
const darkQuery = matchMedia("(prefers-color-scheme: dark)");

interface ViewTransitionLike {
  ready: Promise<void>;
  finished: Promise<void>;
}

type DocumentWithVT = Document & {
  startViewTransition?: (cb: () => void) => ViewTransitionLike;
};

let activeTransition = false;

function readStoredMode(): SchemeMode | null {
  try {
    const val = localStorage.getItem("mote-scheme");
    if (val === "light" || val === "dark" || val === "auto") return val;
  } catch {
    /* Storage is optional for the current page. */
  }
  return null;
}

export function currentSchemeMode(): SchemeMode {
  const stored = readStoredMode();
  if (stored) return stored;
  const def = root.dataset.schemeDefault;
  if (def === "dark" || def === "auto") return def;
  return "light";
}

function resolveOrigin(event?: MouseEvent): { x: number; y: number } {
  if (event && (event.clientX > 0 || event.clientY > 0)) {
    return { x: event.clientX, y: event.clientY };
  }
  const target =
    (event?.currentTarget instanceof HTMLElement ? event.currentTarget : null) ??
    document.querySelector<HTMLElement>(".header-actions [data-scheme-toggle]");
  if (target) {
    const rect = target.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
      };
    }
  }
  return { x: Math.round(window.innerWidth - 48), y: 32 };
}

function apply(dark: boolean) {
  root.classList.toggle("dark", dark);
  root.classList.toggle("color-scheme-dark", dark);
  root.classList.toggle("color-scheme-light", !dark);
  root.dataset.colorScheme = dark ? "dark" : "light";

  const label = dark ? "切换浅色模式" : "切换深色模式";
  document
    .querySelectorAll<HTMLElement>("[data-scheme-toggle]")
    .forEach((button) => {
      button.setAttribute("aria-label", label);
      button.dataset.tip = label;
      refreshTooltip(button);
    });

  document.dispatchEvent(new CustomEvent(SCHEME_EVENT));
}

function applyWithTransition(dark: boolean, event?: MouseEvent) {
  const wasDark = root.classList.contains("dark");
  const doc = document as DocumentWithVT;

  if (
    wasDark === dark ||
    activeTransition ||
    !motionAllowed() ||
    typeof doc.startViewTransition !== "function"
  ) {
    apply(dark);
    return;
  }

  const { x, y } = resolveOrigin(event);
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );

  activeTransition = true;
  root.dataset.schemeTransition = dark ? "dark" : "light";

  try {
    const transition = doc.startViewTransition(() => {
      apply(dark);
    });

    void transition.ready
      .then(() => {
        root.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${endRadius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 420,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            pseudoElement: "::view-transition-new(root)",
          },
        );
      })
      .catch(() => {
        /* Transition skipped or unsupported pseudo-element animation. */
      });

    void transition.finished.finally(() => {
      delete root.dataset.schemeTransition;
      activeTransition = false;
    });
  } catch {
    delete root.dataset.schemeTransition;
    activeTransition = false;
    apply(dark);
  }
}

export function setScheme(
  mode: SchemeMode | null,
  silent = false,
  event?: MouseEvent,
) {
  try {
    if (mode) localStorage.setItem("mote-scheme", mode);
    else localStorage.removeItem("mote-scheme");
  } catch {
    /* Storage is optional for the current page. */
  }
  const effective = mode ?? currentSchemeMode();
  const dark =
    effective === "dark" || (effective === "auto" && darkQuery.matches);
  applyWithTransition(dark, event);
  if (!silent) {
    const msg =
      effective === "auto"
        ? "外观已设为跟随系统"
        : dark
          ? "已切换为柔和暗色"
          : "已切换为纯净亮色";
    toast(msg, "info");
  }
}

export function toggleScheme(event?: MouseEvent) {
  const next: SchemeMode = root.classList.contains("dark") ? "light" : "dark";
  setScheme(next, false, event);
}

export function initScheme() {
  apply(root.classList.contains("dark"));

  document
    .querySelectorAll<HTMLElement>("[data-scheme-toggle]")
    .forEach((button) =>
      button.addEventListener("click", (event) => toggleScheme(event)),
    );

  darkQuery.addEventListener("change", (event) => {
    if (currentSchemeMode() === "auto") {
      applyWithTransition(event.matches);
    }
  });
}
