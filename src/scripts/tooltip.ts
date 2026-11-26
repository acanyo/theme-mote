/**
 * Global Instant Tooltip Controller ("秒响应" tooltip):
 * - 35ms cold response, 0ms instant handoff when gliding across adjacent triggers
 * - Supports explicit `data-tip` (+ optional `data-tip-kbd`, `data-tip-pos="top|bottom"`)
 * - Automatically upgrades native `[title]` attributes on interactive elements so slow OS
 *   tooltips never collide with the theme tooltip
 * - Smart viewport edge clamping & auto top/bottom flipping
 * - Auto-disabled on coarse/touch pointers; cleans up cleanly on click/scroll/Swup
 */

const COLD_DELAY_MS = 35;
const WARM_WINDOW_MS = 380;
const GAP = 7;
const EDGE = 10;

const TITLE_EXCLUDE = "iframe, svg, link, style, script, meta";

let tipEl: HTMLElement | null = null;
let textEl: HTMLElement | null = null;
let kbdEl: HTMLElement | null = null;
let activeTarget: HTMLElement | null = null;
let showTimer = 0;
let lastHideAt = 0;

function ensureTooltip(): HTMLElement {
  if (tipEl && tipEl.isConnected) return tipEl;
  tipEl = document.createElement("div");
  tipEl.className = "mote-tip";
  tipEl.id = "mote-global-tip";
  tipEl.setAttribute("role", "tooltip");
  tipEl.setAttribute("aria-hidden", "true");

  textEl = document.createElement("span");
  textEl.className = "mote-tip-text";

  kbdEl = document.createElement("kbd");
  kbdEl.className = "mote-tip-kbd";
  kbdEl.hidden = true;

  tipEl.append(textEl, kbdEl);
  document.body.append(tipEl);
  return tipEl;
}

function upgradeNativeTitle(el: HTMLElement) {
  const nativeTitle = el.getAttribute("title")?.trim();
  if (!nativeTitle) return;
  if (!el.dataset.tip) {
    el.dataset.tip = nativeTitle;
  }
  if (!el.getAttribute("aria-label") && !el.textContent?.trim()) {
    el.setAttribute("aria-label", nativeTitle);
  }
  el.removeAttribute("title");
}

function findTipTarget(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null;
  const el = node.closest<HTMLElement>("[data-tip], [title]");
  if (!el) return null;
  if (el.matches(TITLE_EXCLUDE)) return null;
  if (el.hasAttribute("title")) {
    upgradeNativeTitle(el);
  }
  const text = el.dataset.tip?.trim();
  if (!text) return null;
  return el;
}

function positionTooltip(target: HTMLElement) {
  const el = ensureTooltip();
  const text = target.dataset.tip?.trim() ?? "";
  const kbd = target.dataset.tipKbd?.trim() ?? "";
  if (!text) {
    hideTooltip();
    return;
  }

  if (textEl) textEl.textContent = text;
  if (kbdEl) {
    kbdEl.textContent = kbd;
    kbdEl.hidden = !kbd;
  }

  const rect = target.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    hideTooltip();
    return;
  }

  const tipWidth = el.offsetWidth;
  const tipHeight = el.offsetHeight;
  const prefer = target.dataset.tipPos;

  let pos: "top" | "bottom" = prefer === "bottom" ? "bottom" : "top";
  if (pos === "top" && rect.top - tipHeight - GAP < EDGE) {
    pos = "bottom";
  } else if (
    pos === "bottom" &&
    rect.bottom + tipHeight + GAP > window.innerHeight - EDGE
  ) {
    pos = "top";
  }

  const top =
    pos === "bottom" ? rect.bottom + GAP : rect.top - tipHeight - GAP;
  let left = rect.left + rect.width / 2 - tipWidth / 2;
  left = Math.max(EDGE, Math.min(left, window.innerWidth - tipWidth - EDGE));

  el.dataset.pos = pos;
  el.style.top = `${Math.round(top)}px`;
  el.style.left = `${Math.round(left)}px`;
}

function showTooltip(target: HTMLElement) {
  if (!target.isConnected) return;
  activeTarget = target;
  const el = ensureTooltip();
  positionTooltip(target);
  el.setAttribute("aria-hidden", "false");
  el.classList.add("is-shown");
}

export function hideTooltip() {
  clearTimeout(showTimer);
  showTimer = 0;
  if (tipEl?.classList.contains("is-shown")) {
    lastHideAt = Date.now();
    tipEl.classList.remove("is-shown");
    tipEl.setAttribute("aria-hidden", "true");
  }
  activeTarget = null;
}

export function refreshTooltip(target: HTMLElement) {
  if (activeTarget === target && tipEl?.classList.contains("is-shown")) {
    positionTooltip(target);
  }
}

export function initTooltip(): { hide: () => void } | null {
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return null;

  document.addEventListener("pointerover", (event) => {
    if (event.pointerType !== "mouse") return;
    const target = findTipTarget(event.target);
    if (!target) {
      if (activeTarget) hideTooltip();
      return;
    }
    if (target === activeTarget && tipEl?.classList.contains("is-shown")) {
      return;
    }

    clearTimeout(showTimer);
    const isWarm =
      tipEl?.classList.contains("is-shown") ||
      Date.now() - lastHideAt < WARM_WINDOW_MS;

    if (isWarm) {
      showTooltip(target);
    } else {
      activeTarget = target;
      showTimer = window.setTimeout(() => {
        if (activeTarget === target) showTooltip(target);
      }, COLD_DELAY_MS);
    }
  });

  document.addEventListener("pointerout", (event) => {
    if (!activeTarget) return;
    const related = event.relatedTarget;
    if (related instanceof Node && activeTarget.contains(related)) return;
    const next = findTipTarget(related);
    if (next && next !== activeTarget) return;
    hideTooltip();
  });

  document.addEventListener("focusin", (event) => {
    const target = findTipTarget(event.target);
    if (!target) return;
    if (!target.matches(":focus-visible")) return;
    showTooltip(target);
  });

  document.addEventListener("focusout", hideTooltip);
  document.addEventListener("pointerdown", hideTooltip);
  document.addEventListener("click", hideTooltip);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideTooltip();
  });
  window.addEventListener("scroll", hideTooltip, { passive: true });
  window.addEventListener("blur", hideTooltip);

  return { hide: hideTooltip };
}
