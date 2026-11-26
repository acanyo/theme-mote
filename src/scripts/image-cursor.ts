/**
 * Floating custom image-viewing cursor for styles D (frosted), E (aperture), and F (pill).
 * Styles A (viewfinder), B (loupe), C (expand), and system are pure CSS SVG cursors
 * with zero JS overhead.
 */
import { gsap } from "./animation/engine";
import { motionAllowed } from "./motion";

const FLOAT_STYLES = new Set(["frosted", "aperture", "pill"]);
const IMAGE_TARGET_SELECTOR =
  "[data-lightbox-trigger], .photo-card, .article-cover img, .prose img";

function findImageTarget(node: EventTarget | null): Element | null {
  if (!(node instanceof Element)) return null;
  if (node.closest(".minimal-lightbox, .is-img-error")) return null;
  const match = node.closest(IMAGE_TARGET_SELECTOR);
  if (!match) return null;
  if (match.matches(".prose img") && match.closest("a")) return null;
  return match;
}

function buildCursorMarkup(style: string): string {
  if (style === "frosted") {
    return `<span class="mote-image-cursor-inner"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg></span>`;
  }
  if (style === "aperture") {
    return `<span class="mote-image-cursor-inner"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 2v8M2 6h8" /></svg></span>`;
  }
  return `<span class="mote-image-cursor-inner"><span>查看</span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg></span>`;
}

export function initImageCursor(): { hide: () => void } | null {
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return null;

  const root = document.documentElement;
  const style = root.dataset.imageCursor ?? "viewfinder";
  if (!FLOAT_STYLES.has(style)) return null;

  const existing = document.querySelector<HTMLElement>("[data-mote-image-cursor]");
  existing?.remove();

  const cursor = document.createElement("div");
  cursor.className = "mote-image-cursor";
  cursor.dataset.moteImageCursor = "";
  cursor.dataset.style = style;
  cursor.setAttribute("aria-hidden", "true");
  cursor.innerHTML = buildCursorMarkup(style);
  document.body.appendChild(cursor);
  root.classList.add("has-float-image-cursor");

  gsap.set(cursor, { autoAlpha: 0, x: -100, y: -100 });
  const xTo = gsap.quickTo(cursor, "x", { duration: 0.16, ease: "power3.out" });
  const yTo = gsap.quickTo(cursor, "y", { duration: 0.16, ease: "power3.out" });

  let visible = false;

  const showAt = (x: number, y: number) => {
    if (!visible) {
      visible = true;
      gsap.set(cursor, { x, y });
      cursor.classList.add("is-visible");
      gsap.to(cursor, {
        autoAlpha: 1,
        duration: motionAllowed() ? 0.16 : 0,
        ease: "power2.out",
        overwrite: "auto",
      });
    } else if (motionAllowed()) {
      xTo(x);
      yTo(y);
    } else {
      gsap.set(cursor, { x, y });
    }
  };

  const hide = () => {
    if (!visible) return;
    visible = false;
    cursor.classList.remove("is-visible", "is-pressed");
    gsap.to(cursor, {
      autoAlpha: 0,
      duration: motionAllowed() ? 0.14 : 0,
      ease: "power2.in",
      overwrite: "auto",
    });
  };

  document.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType !== "mouse") {
        hide();
        return;
      }
      const target = findImageTarget(event.target);
      if (!target) {
        hide();
        return;
      }
      showAt(event.clientX, event.clientY);
    },
    { passive: true },
  );

  document.addEventListener("pointerdown", () => {
    if (visible) cursor.classList.add("is-pressed");
  });

  document.addEventListener("pointerup", () => {
    cursor.classList.remove("is-pressed");
  });

  document.addEventListener("pointerleave", hide);
  window.addEventListener("blur", hide);
  window.addEventListener("scroll", hide, { passive: true });
  document.addEventListener("click", (event) => {
    if (findImageTarget(event.target)) {
      hide();
    }
  });

  return { hide };
}
