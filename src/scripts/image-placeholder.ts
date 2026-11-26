/**
 * Site-wide Image Loading Skeleton & Error Fallback Controller:
 * - Zero-flicker detection for already cached/loaded images
 * - Editorial shimmer skeleton while loading (or custom user placeholder image)
 * - Graceful broken-image fallback with retry button (or custom error image)
 * - Clean compact fallback for circular avatars & small icons
 * - Swup & lazy-load safe via capturing global events + lightweight MutationObserver
 */

import { toast } from "./toast";

const IGNORE_SELECTOR =
  "[data-captcha-img], [data-logo-preview-img], [data-reader-cover], [data-lightbox-img], [data-img-placeholder-ignore]";

const FRAME_SELECTOR =
  ".filmstrip-frame, .photo-card, .photo-stage-frame, .article-cover, .moment-photo, .timeline-photo-btn";

const AVATAR_SELECTOR =
  ".brand-avatar, .byline-avatar, .colophon-avatar, .moment-avatar, .friend-badge-img, .link-avatar, .minimal-project-icon img";

const BROKEN_ICON_SVG = `<svg class="img-error-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5"></rect><circle cx="9" cy="10" r="1.4"></circle><path d="m21 16-4.2-4.2a1.5 1.5 0 0 0-2.1 0L9 17.5"></path><path d="m3 3 18 18"></path></svg>`;

const AVATAR_FALLBACK_DATA_URI =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' fill='%238896a8' fill-opacity='0.14'/%3E%3Ccircle cx='20' cy='15.5' r='5.5' fill='none' stroke='%238896a8' stroke-opacity='0.65' stroke-width='2'/%3E%3Cpath d='M10.5 31.5c1.8-4.5 5.4-6.8 9.5-6.8s7.7 2.3 9.5 6.8' fill='none' stroke='%238896a8' stroke-opacity='0.65' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E";

function getCustomErrorSrc(): string {
  return (document.documentElement.dataset.imgErrorSrc ?? "").trim();
}

function shouldIgnore(img: HTMLImageElement): boolean {
  if (img.matches(IGNORE_SELECTOR)) return true;
  if (img.closest("[data-img-placeholder-ignore]")) return true;
  if (img.classList.contains("img-error-custom")) return true;
  return false;
}

function getRawSrc(img: HTMLImageElement): string {
  return (img.getAttribute("src") ?? "").trim();
}

function withRetryParam(url: string): string {
  try {
    const parsed = new URL(url, location.href);
    parsed.searchParams.set("_retry", String(Date.now()));
    return parsed.href;
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}_retry=${Date.now()}`;
  }
}

function findFrame(img: HTMLImageElement): HTMLElement | null {
  return img.closest<HTMLElement>(FRAME_SELECTOR);
}

function clearFrameOverlay(frame: HTMLElement) {
  frame.querySelector<HTMLElement>(":scope > [data-img-error-overlay]")?.remove();
}

function clearProseCard(img: HTMLImageElement) {
  const next = img.nextElementSibling;
  if (next?.hasAttribute("data-img-error-card")) {
    next.remove();
  }
}

function finalizeLoaded(img: HTMLImageElement) {
  if (!img.isConnected) return;
  if (img.dataset.imgState === "error") return;
  img.dataset.imgState = "loaded";
  const frame = findFrame(img);
  if (frame) {
    frame.classList.remove("is-img-loading", "is-img-error");
    clearFrameOverlay(frame);
  } else {
    clearProseCard(img);
  }
}

function markLoaded(img: HTMLImageElement, immediate = false) {
  if (shouldIgnore(img)) return;
  if (img.dataset.imgFallback === "avatar") return;
  if (img.naturalWidth === 0) {
    markError(img);
    return;
  }

  if (immediate || typeof img.decode !== "function") {
    finalizeLoaded(img);
    return;
  }

  img
    .decode()
    .catch(() => {})
    .finally(() => finalizeLoaded(img));
}

function buildErrorInner(
  customErrorSrc: string,
  options: {
    allowRetry: boolean;
    useButton: boolean;
    altText?: string;
    onCustomError?: () => void;
  },
): DocumentFragment {
  const frag = document.createDocumentFragment();
  if (customErrorSrc) {
    const fallbackImg = document.createElement("img");
    fallbackImg.className = "img-error-custom";
    fallbackImg.src = customErrorSrc;
    fallbackImg.alt = options.altText || "图片加载失败";
    fallbackImg.decoding = "async";
    fallbackImg.addEventListener(
      "error",
      () => {
        options.onCustomError?.();
      },
      { once: true },
    );
    frag.appendChild(fallbackImg);
    return frag;
  }

  const iconWrap = document.createElement("span");
  iconWrap.innerHTML = BROKEN_ICON_SVG;
  if (iconWrap.firstChild) frag.appendChild(iconWrap.firstChild);

  const label = document.createElement("span");
  label.className = "img-error-label";
  label.textContent = "图片加载失败";
  frag.appendChild(label);

  if (options.altText) {
    const alt = document.createElement("span");
    alt.className = "img-error-alt";
    alt.textContent = options.altText;
    frag.appendChild(alt);
  }

  if (options.allowRetry) {
    if (options.useButton) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "img-retry-btn";
      btn.dataset.imgRetry = "";
      btn.textContent = "点击重试";
      frag.appendChild(btn);
    } else {
      const chip = document.createElement("span");
      chip.className = "img-retry-chip";
      chip.setAttribute("role", "button");
      chip.setAttribute("tabindex", "0");
      chip.dataset.imgRetry = "";
      chip.textContent = "重试";
      frag.appendChild(chip);
    }
  }

  return frag;
}

function renderBuiltInFallback(
  container: HTMLElement,
  options: { allowRetry: boolean; useButton: boolean; altText?: string },
) {
  container.classList.remove("has-custom");
  container.replaceChildren(
    buildErrorInner("", {
      allowRetry: options.allowRetry,
      useButton: options.useButton,
      altText: options.altText,
    }),
  );
}

function markError(img: HTMLImageElement) {
  if (shouldIgnore(img)) return;
  if (!getRawSrc(img)) return;

  // Compact circular avatars & tiny project icons: swap to clean monochrome SVG fallback
  if (img.matches(AVATAR_SELECTOR)) {
    if (img.dataset.imgFallback === "avatar") return;
    img.dataset.imgFallback = "avatar";
    img.dataset.imgState = "error";
    img.src = AVATAR_FALLBACK_DATA_URI;
    return;
  }

  if (!img.dataset.imgOrigSrc) {
    img.dataset.imgOrigSrc = img.currentSrc || getRawSrc(img);
  }
  img.dataset.imgState = "error";

  const customErrorSrc = getCustomErrorSrc();
  const frame = findFrame(img);

  if (frame) {
    frame.classList.remove("is-img-loading");
    frame.classList.add("is-img-error");
    clearFrameOverlay(frame);

    const isInteractiveParent = frame.matches("a, button");
    const allowRetry = !frame.matches("a");

    const overlay = document.createElement("div");
    overlay.className = customErrorSrc
      ? "img-error-overlay has-custom"
      : "img-error-overlay";
    overlay.dataset.imgErrorOverlay = "";
    overlay.appendChild(
      buildErrorInner(customErrorSrc, {
        allowRetry,
        useButton: !isInteractiveParent,
        onCustomError: () =>
          renderBuiltInFallback(overlay, {
            allowRetry,
            useButton: !isInteractiveParent,
          }),
      }),
    );
    frame.appendChild(overlay);
    return;
  }

  // Standalone image (e.g. Markdown `.prose img`)
  clearProseCard(img);
  const altText = (img.alt ?? "").trim();
  const card = document.createElement("div");
  card.className = customErrorSrc
    ? "img-error-card has-custom"
    : "img-error-card";
  card.dataset.imgErrorCard = "";
  card.appendChild(
    buildErrorInner(customErrorSrc, {
      allowRetry: true,
      useButton: true,
      altText: altText && altText.length <= 60 ? altText : undefined,
      onCustomError: () =>
        renderBuiltInFallback(card, {
          allowRetry: true,
          useButton: true,
          altText: altText && altText.length <= 60 ? altText : undefined,
        }),
    }),
  );
  img.insertAdjacentElement("afterend", card);
}

export function markImageLoading(img: HTMLImageElement) {
  if (shouldIgnore(img)) return;
  if (!getRawSrc(img)) return;

  img.dataset.imgState = "loading";
  const frame = findFrame(img);
  if (frame) {
    frame.classList.remove("is-img-error");
    frame.classList.add("is-img-loading");
    clearFrameOverlay(frame);
  } else {
    clearProseCard(img);
  }
}

export function trackImage(img: HTMLImageElement) {
  if (shouldIgnore(img)) return;
  const raw = getRawSrc(img);
  if (!raw) return;

  if (!img.dataset.imgOrigSrc && img.dataset.imgFallback !== "avatar") {
    img.dataset.imgOrigSrc = raw;
  }

  if (img.complete) {
    if (img.naturalWidth > 0) {
      markLoaded(img, true);
    } else {
      markError(img);
    }
  } else {
    markImageLoading(img);
  }
}

function retryImage(trigger: Element) {
  const overlay = trigger.closest<HTMLElement>("[data-img-error-overlay]");
  const card = trigger.closest<HTMLElement>("[data-img-error-card]");

  let img: HTMLImageElement | null = null;
  if (overlay) {
    const frame = overlay.parentElement;
    img = frame?.querySelector<HTMLImageElement>("img:not(.img-error-custom)") ?? null;
  } else if (card) {
    const prev = card.previousElementSibling;
    if (prev instanceof HTMLImageElement) img = prev;
  }

  if (!img) return;
  const orig = img.dataset.imgOrigSrc || getRawSrc(img);
  if (!orig) return;

  markImageLoading(img);
  img.src = withRetryParam(orig);
  toast("正在重新加载图片…", "info");
}

let globalInitialized = false;

export function initImagePlaceholdersGlobal() {
  if (globalInitialized) return;
  globalInitialized = true;

  document.addEventListener(
    "load",
    (event) => {
      if (event.target instanceof HTMLImageElement) {
        markLoaded(event.target);
      }
    },
    true,
  );

  document.addEventListener(
    "error",
    (event) => {
      if (event.target instanceof HTMLImageElement) {
        markError(event.target);
      }
    },
    true,
  );

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const retryEl = target.closest("[data-img-retry]");
    if (!retryEl || retryEl.closest(".minimal-lightbox")) return;
    event.preventDefault();
    event.stopPropagation();
    retryImage(retryEl);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const retryEl = target.closest("[data-img-retry]");
    if (!retryEl || retryEl.closest(".minimal-lightbox")) return;
    event.preventDefault();
    event.stopPropagation();
    retryImage(retryEl);
  });
}

export function initImagePlaceholdersPage(): () => void {
  document
    .querySelectorAll<HTMLImageElement>("img")
    .forEach((img) => trackImage(img));

  const main = document.getElementById("main");
  if (!main) return () => {};

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLImageElement) {
          trackImage(node);
        } else if (node instanceof Element) {
          node
            .querySelectorAll<HTMLImageElement>("img")
            .forEach((img) => trackImage(img));
        }
      });
    }
  });

  observer.observe(main, { childList: true, subtree: true });
  return () => observer.disconnect();
}
