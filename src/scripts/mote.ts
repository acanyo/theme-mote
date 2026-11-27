/**
 * Minimal Plus interactions with Swup-safe global vs per-page lifecycle + GSAP motion:
 * - Excerpt visibility toggle persisted in localStorage with subtle GSAP stagger reveal
 * - 60fps GSAP quickTo right-margin floating cover preview on desktop hover
 * - Persistent Web Audio filtered pink-noise rain toggle (keeps playing across Swup visits)
 * - GSAP fullscreen lightbox with gallery slide nav & keyboard controls
 * - One-click code block copy button
 * - Delegated random post trigger
 */
import { copyText, openRandomPost } from "./actions";
import { gsap, settleEase, travelEase } from "./animation/engine";
import { initCoverPalette } from "./cover-palette";
import { motionAllowed } from "./motion";
import { createOverlay } from "./overlay";
import { toast } from "./toast";
import { handleUpvoteClick, syncUpvotedButtons } from "./upvote";

/* Persistent module-level Rain Audio state so rain keeps playing across Swup visits */
let rainCtx: AudioContext | null = null;
let rainGain: GainNode | null = null;
let rainPlaying = false;

function syncRainButtons() {
  const tip = rainPlaying ? "关闭细雨白噪音" : "开启细雨白噪音";
  document
    .querySelectorAll<HTMLButtonElement>("[data-rain-toggle]")
    .forEach((btn) => {
      btn.setAttribute("aria-pressed", String(rainPlaying));
      btn.dataset.tip = tip;
    });
}

const PROSE_SIZES = ["md", "lg", "sm"] as const;
type ProseSize = (typeof PROSE_SIZES)[number];

const PROSE_SIZE_META: Record<ProseSize, { label: string; toast: string }> = {
  sm: { label: "A-", toast: "正文字号：紧凑" },
  md: { label: "A", toast: "正文字号：标准" },
  lg: { label: "A+", toast: "正文字号：舒适大号" },
};

function syncReaderControls() {
  const root = document.documentElement;
  const font = root.dataset.proseFont === "serif" ? "serif" : "sans";
  const isSerif = font === "serif";
  document
    .querySelectorAll<HTMLButtonElement>("[data-prose-font-toggle]")
    .forEach((btn) => btn.setAttribute("aria-pressed", String(isSerif)));
  document
    .querySelectorAll<HTMLButtonElement>("[data-prose-font-pick]")
    .forEach((btn) => {
      const active = btn.dataset.proseFontPick === font;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-checked", String(active));
    });

  const rawSize = root.dataset.proseSize as ProseSize | undefined;
  const size: ProseSize =
    rawSize && rawSize in PROSE_SIZE_META ? rawSize : "md";
  document
    .querySelectorAll<HTMLElement>("[data-prose-size-label]")
    .forEach((el) => {
      el.textContent = PROSE_SIZE_META[size].label;
    });
  document
    .querySelectorAll<HTMLButtonElement>("[data-prose-size-cycle]")
    .forEach((btn) => btn.setAttribute("aria-pressed", String(size !== "md")));
  document
    .querySelectorAll<HTMLButtonElement>("[data-prose-size-pick]")
    .forEach((btn) => {
      const active = btn.dataset.proseSizePick === size;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-checked", String(active));
    });
}

function setProseFont(next: "sans" | "serif", silent = false) {
  const root = document.documentElement;
  if (next === "sans") delete root.dataset.proseFont;
  else root.dataset.proseFont = "serif";
  try {
    if (next === "serif") localStorage.setItem("mote-prose-font", "serif");
    else localStorage.removeItem("mote-prose-font");
  } catch {
    /* Storage is optional. */
  }
  syncReaderControls();
  if (!silent) {
    toast(next === "serif" ? "已切换为书刊衬线体" : "已切换为默认无衬线体");
  }
}

function toggleProseFont() {
  const next =
    document.documentElement.dataset.proseFont === "serif" ? "sans" : "serif";
  setProseFont(next);
}

function setProseSize(next: ProseSize, silent = false) {
  const root = document.documentElement;
  if (next === "md") delete root.dataset.proseSize;
  else root.dataset.proseSize = next;
  try {
    if (next === "md") localStorage.removeItem("mote-prose-size");
    else localStorage.setItem("mote-prose-size", next);
  } catch {
    /* Storage is optional. */
  }
  syncReaderControls();
  if (!silent) toast(PROSE_SIZE_META[next].toast);
}

function cycleProseSize() {
  const root = document.documentElement;
  const current = (root.dataset.proseSize as ProseSize | undefined) ?? "md";
  const idx = PROSE_SIZES.indexOf(current);
  const next = PROSE_SIZES[(idx + 1) % PROSE_SIZES.length];
  setProseSize(next);
}

function toggleRainAudio() {
  if (rainPlaying) {
    if (rainCtx && rainGain) {
      rainGain.gain.cancelScheduledValues(rainCtx.currentTime);
      rainGain.gain.linearRampToValueAtTime(0.0001, rainCtx.currentTime + 0.35);
    }
    rainPlaying = false;
    syncRainButtons();
    toast("已关闭细雨白噪音", "info");
    return;
  }

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) {
    toast("当前浏览器不支持音频播放");
    return;
  }

  if (!rainCtx) {
    rainCtx = new AudioCtx();
    const bufferSize = rainCtx.sampleRate * 3;
    const buffer = rainCtx.createBuffer(1, bufferSize, rainCtx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.035;
      b6 = white * 0.115926;
    }

    const source = rainCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = rainCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1150;

    rainGain = rainCtx.createGain();
    rainGain.gain.value = 0.0001;

    source.connect(filter);
    filter.connect(rainGain);
    rainGain.connect(rainCtx.destination);
    source.start();
  }

  if (rainCtx.state === "suspended") void rainCtx.resume();
  if (rainGain) {
    rainGain.gain.cancelScheduledValues(rainCtx.currentTime);
    rainGain.gain.linearRampToValueAtTime(0.32, rainCtx.currentTime + 0.6);
  }
  rainPlaying = true;
  syncRainButtons();
  toast("已开启细雨白噪音", "info");
}

function initCategoryFilter() {
  const tabs = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-cat-filter]"),
  );
  const rows = Array.from(
    document.querySelectorAll<HTMLElement>("[data-post-rows] .post-row-item"),
  );
  if (!tabs.length || !rows.length) return;

  const emptyNote = document.querySelector<HTMLElement>("[data-filter-empty]");
  const moreLink = document.querySelector<HTMLAnchorElement>("[data-writing-more]");
  const moreLabel = moreLink?.querySelector<HTMLElement>(
    "[data-writing-more-label]",
  );

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const cat = tab.dataset.catFilter ?? "all";
      if (tab.classList.contains("is-active")) return;

      tabs.forEach((btn) => {
        const active = btn === tab;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-pressed", String(active));
      });

      const visible: HTMLElement[] = [];
      rows.forEach((row) => {
        const cats = (row.dataset.postCats ?? "").split(",").filter(Boolean);
        const match = cat === "all" || cats.includes(cat);
        row.hidden = !match;
        if (match) visible.push(row);
      });

      if (emptyNote) {
        emptyNote.hidden = visible.length > 0;
      }

      if (moreLink && moreLabel) {
        if (cat === "all") {
          moreLink.href = moreLink.dataset.defaultHref || "/archives";
          moreLabel.textContent = "查看全部归档";
        } else {
          const href = tab.dataset.catHref;
          const name = tab.dataset.catName || tab.textContent?.trim() || "";
          if (href) moreLink.href = href;
          moreLabel.textContent = name
            ? `查看「${name}」全部文章`
            : "查看该分类全部文章";
        }
      }

      if (visible.length && motionAllowed()) {
        gsap.fromTo(
          visible,
          { opacity: 0, y: 6 },
          {
            opacity: 1,
            y: 0,
            duration: 0.24,
            stagger: 0.025,
            ease: settleEase,
            clearProps: "transform,opacity",
            overwrite: "auto",
          },
        );
      }
    });
  });
}

function initExcerptToggle() {
  const root = document.documentElement;
  const button = document.querySelector<HTMLButtonElement>(
    "[data-excerpt-toggle]",
  );
  if (!button) return;

  const sync = (shown: boolean) => {
    root.dataset.showExcerpt = String(shown);
    button.setAttribute("aria-pressed", String(shown));
    button.dataset.tip = shown ? "收起文章摘录" : "展开文章摘录";
  };

  sync(root.dataset.showExcerpt === "true");

  button.addEventListener("click", () => {
    const next = root.dataset.showExcerpt !== "true";
    sync(next);
    toast(next ? "已展开文章摘录" : "已收起文章摘录", "info");
    if (next && motionAllowed()) {
      const excerpts = document.querySelectorAll<HTMLElement>(
        ".post-row-excerpt",
      );
      if (excerpts.length) {
        gsap.fromTo(
          excerpts,
          { opacity: 0, y: -4 },
          {
            opacity: 1,
            y: 0,
            duration: 0.24,
            stagger: 0.025,
            ease: settleEase,
            clearProps: "transform,opacity",
            overwrite: "auto",
          },
        );
      }
    }
    try {
      localStorage.setItem("mote-show-excerpt", String(next));
    } catch {
      /* Storage is optional. */
    }
  });
}

const coverPreloadCache = new Map<string, Promise<boolean>>();

function preloadCover(url: string): Promise<boolean> {
  const cached = coverPreloadCache.get(url);
  if (cached) return cached;

  const promise = new Promise<boolean>((resolve) => {
    const probe = new Image();
    probe.decoding = "async";
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (!ok) {
        coverPreloadCache.delete(url);
        resolve(false);
        return;
      }
      if (typeof probe.decode === "function") {
        probe
          .decode()
          .catch(() => {})
          .finally(() => resolve(true));
      } else {
        resolve(true);
      }
    };
    probe.onload = () => finish(probe.naturalWidth > 0);
    probe.onerror = () => finish(false);
    probe.src = url;
    if (probe.complete && probe.naturalWidth > 0) finish(true);
  });

  coverPreloadCache.set(url, promise);
  return promise;
}

function initHoverCoverPreview(): () => void {
  const preview = document.querySelector<HTMLElement>("[data-hover-preview]");
  const layers = Array.from(
    preview?.querySelectorAll<HTMLImageElement>("[data-hover-preview-layer]") ??
      [],
  );
  const rows = document.querySelector<HTMLElement>(
    "[data-post-rows], [data-archive-list]",
  );
  if (!preview || layers.length < 2 || !rows) return () => {};
  if (!matchMedia("(hover: hover) and (pointer: fine) and (min-width: 1101px)").matches)
    return () => {};

  gsap.set(preview, { autoAlpha: 0, scale: 0.965, x: 0, y: 0 });
  gsap.set(layers, { opacity: 0, scale: 1, clipPath: "inset(0% 0% 0% 0%)" });

  const yTo = gsap.quickTo(preview, "y", { duration: 0.2, ease: "power3.out" });

  let activeUrl = "";
  let visible = false;
  let hasPaintedOnce = false;
  let activeLayerIdx = 0;
  let requestId = 0;
  let lastRowTop: number | null = null;
  let anchorScrollY = 0;
  let warmedUp = false;
  let hideTimer: number | null = null;

  const cancelHideTimer = () => {
    if (hideTimer !== null) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
  };

  const computePos = (row: HTMLElement) => {
    const rowRect = row.getBoundingClientRect();
    const listRect = rows.getBoundingClientRect();
    const cardW = preview.offsetWidth || 200;
    const cardH = preview.offsetHeight || 125;

    const x = Math.round(
      Math.min(listRect.right + 32, window.innerWidth - cardW - 20),
    );
    const y = Math.round(
      Math.min(
        Math.max(rowRect.top + rowRect.height / 2 - cardH / 2, 76),
        window.innerHeight - cardH - 20,
      ),
    );
    return { x, y, rowTop: rowRect.top };
  };

  const hideNow = () => {
    cancelHideTimer();
    requestId += 1;
    activeUrl = "";
    lastRowTop = null;
    preview.classList.remove("is-loading");
    if (!visible) return;
    visible = false;
    hasPaintedOnce = false;

    const animate = motionAllowed();
    gsap.to(preview, {
      autoAlpha: 0,
      scale: 0.975,
      duration: animate ? 0.14 : 0,
      ease: "power2.out",
      overwrite: "auto",
      onComplete: () => {
        if (!visible) {
          gsap.set(layers, {
            opacity: 0,
            scale: 1,
            clipPath: "inset(0% 0% 0% 0%)",
          });
        }
      },
    });
  };

  const scheduleHide = () => {
    if (!visible && hideTimer === null) return;
    cancelHideTimer();
    hideTimer = window.setTimeout(hideNow, 55);
  };

  const warmUpCovers = () => {
    if (warmedUp) return;
    warmedUp = true;
    const seen = new Set<string>();
    const nodes = rows.querySelectorAll<HTMLElement>("[data-hover-cover]");
    for (const node of nodes) {
      const url = node.dataset.hoverCover;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      void preloadCover(url);
      if (seen.size >= 8) break;
    }
  };

  const swapCover = (url: string, dir: number) => {
    const myReq = ++requestId;
    if (!hasPaintedOnce) {
      preview.classList.add("is-loading");
    }

    void preloadCover(url).then((ok) => {
      if (myReq !== requestId || !visible) return;
      preview.classList.remove("is-loading");

      if (!ok) {
        if (!hasPaintedOnce) hideNow();
        return;
      }

      const animate = motionAllowed();
      const prevIdx = activeLayerIdx;
      const nextIdx = hasPaintedOnce ? 1 - prevIdx : 0;
      const incoming = layers[nextIdx];
      const outgoing = layers[prevIdx];

      incoming.src = url;
      incoming.style.zIndex = "2";
      outgoing.style.zIndex = "1";

      if (!hasPaintedOnce) {
        hasPaintedOnce = true;
        activeLayerIdx = nextIdx;
        gsap.set(outgoing, { opacity: 0, clipPath: "inset(0% 0% 0% 0%)" });
        if (animate) {
          gsap.fromTo(
            incoming,
            { opacity: 1, scale: 1.03, clipPath: "inset(0% 0% 0% 0%)" },
            {
              scale: 1,
              duration: 0.22,
              ease: "power2.out",
              overwrite: "auto",
            },
          );
        } else {
          gsap.set(incoming, {
            opacity: 1,
            scale: 1,
            clipPath: "inset(0% 0% 0% 0%)",
          });
        }
        return;
      }

      activeLayerIdx = nextIdx;
      if (animate) {
        gsap.killTweensOf(outgoing);
        gsap.set(outgoing, {
          opacity: 1,
          scale: 1,
          clipPath: "inset(0% 0% 0% 0%)",
        });
        const startClip =
          dir >= 0 ? "inset(100% 0% 0% 0%)" : "inset(0% 0% 100% 0%)";
        gsap.fromTo(
          incoming,
          { opacity: 1, scale: 1.03, clipPath: startClip },
          {
            scale: 1,
            clipPath: "inset(0% 0% 0% 0%)",
            duration: 0.24,
            ease: "power3.out",
            overwrite: "auto",
            onComplete: () => {
              if (activeLayerIdx !== prevIdx) {
                gsap.set(outgoing, { opacity: 0 });
              }
            },
          },
        );
      } else {
        gsap.set(incoming, {
          opacity: 1,
          scale: 1,
          clipPath: "inset(0% 0% 0% 0%)",
        });
        gsap.set(outgoing, {
          opacity: 0,
          scale: 1,
          clipPath: "inset(0% 0% 0% 0%)",
        });
      }
    });
  };

  const onMouseOver = (event: MouseEvent) => {
    const row = (event.target as Element).closest<HTMLElement>(
      "[data-hover-cover]",
    );
    const url = row?.dataset.hoverCover;
    if (!row || !url) {
      scheduleHide();
      return;
    }

    cancelHideTimer();
    anchorScrollY = window.scrollY;
    const { x, y, rowTop } = computePos(row);
    const dir = lastRowTop === null || rowTop >= lastRowTop ? 1 : -1;
    const animate = motionAllowed();
    const swapped = activeUrl !== url;

    if (!visible) {
      visible = true;
      lastRowTop = rowTop;
      gsap.set(preview, { x, y, scale: animate ? 0.965 : 1 });
      yTo(y, y);
      gsap.to(preview, {
        autoAlpha: 1,
        scale: 1,
        duration: animate ? 0.18 : 0,
        ease: "power2.out",
        overwrite: "auto",
      });
    } else {
      lastRowTop = rowTop;
      gsap.set(preview, { x });
      if (animate) {
        yTo(y);
      } else {
        gsap.set(preview, { y });
      }
    }

    if (swapped) {
      activeUrl = url;
      swapCover(url, dir);
    }
  };

  const onScroll = () => {
    if (!visible) return;
    if (Math.abs(window.scrollY - anchorScrollY) > 20) {
      hideNow();
    }
  };

  rows.addEventListener("pointerenter", warmUpCovers, { passive: true });
  rows.addEventListener("mouseover", onMouseOver);
  rows.addEventListener("mouseleave", hideNow);
  window.addEventListener("scroll", onScroll, { passive: true });

  return () => {
    cancelHideTimer();
    visible = false;
    hasPaintedOnce = false;
    activeUrl = "";
    gsap.killTweensOf([preview, ...layers]);
    rows.removeEventListener("pointerenter", warmUpCovers);
    rows.removeEventListener("mouseover", onMouseOver);
    rows.removeEventListener("mouseleave", hideNow);
    window.removeEventListener("scroll", onScroll);
  };
}

function initLightbox() {
  if (document.documentElement.dataset.lightboxEnabled === "false") return;
  const modal = document.querySelector<HTMLElement>("[data-lightbox]");
  const img = modal?.querySelector<HTMLImageElement>("[data-lightbox-img]");
  const closeBtn = modal?.querySelector<HTMLButtonElement>(
    "[data-lightbox-close]",
  );
  const prevBtn = modal?.querySelector<HTMLButtonElement>(
    "[data-lightbox-prev]",
  );
  const nextBtn = modal?.querySelector<HTMLButtonElement>(
    "[data-lightbox-next]",
  );
  const retryBtn = modal?.querySelector<HTMLButtonElement>(
    "[data-lightbox-retry]",
  );
  if (!modal || !img || !closeBtn || !prevBtn || !nextBtn) return;

  gsap.set(modal, { autoAlpha: 0 });

  let items: string[] = [];
  let index = 0;
  let isOpen = false;
  let currentUrl = "";

  img.addEventListener("load", () => {
    if (!isOpen) return;
    modal.classList.remove("is-loading", "is-error");
  });

  img.addEventListener("error", () => {
    if (!isOpen || !currentUrl) return;
    modal.classList.remove("is-loading");
    modal.classList.add("is-error");
  });

  const render = (direction = 0, bustCache = false) => {
    const raw = items[index] ?? "";
    currentUrl = raw;
    let src = raw;
    if (bustCache && raw) {
      const sep = raw.includes("?") ? "&" : "?";
      src = `${raw}${sep}_retry=${Date.now()}`;
    }

    modal.classList.remove("is-error");
    modal.classList.add("is-loading");
    img.src = src;
    if (img.complete && img.naturalWidth > 0) {
      modal.classList.remove("is-loading");
    }

    const multi = items.length > 1;
    prevBtn.hidden = !multi;
    nextBtn.hidden = !multi;

    if (direction !== 0 && motionAllowed()) {
      gsap.fromTo(
        img,
        { opacity: 0.35, x: direction * 20, scale: 0.98 },
        {
          opacity: 1,
          x: 0,
          scale: 1,
          duration: 0.26,
          ease: travelEase,
          clearProps: "transform",
          overwrite: "auto",
        },
      );
    }
  };

  const open = (urls: string[], startIndex = 0) => {
    items = urls.filter(Boolean);
    if (!items.length) return;
    index = Math.min(Math.max(startIndex, 0), items.length - 1);
    isOpen = true;
    render(0);
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");

    if (motionAllowed()) {
      gsap.killTweensOf([modal, img]);
      gsap.to(modal, { autoAlpha: 1, duration: 0.22, ease: "power2.out" });
      gsap.fromTo(
        img,
        { opacity: 0, scale: 0.94, y: 10 },
        {
          opacity: 1,
          scale: 1,
          y: 0,
          duration: 0.3,
          ease: settleEase,
          clearProps: "transform",
        },
      );
    } else {
      gsap.set(modal, { autoAlpha: 1 });
      gsap.set(img, { opacity: 1, scale: 1, y: 0 });
    }
    closeBtn.focus();
  };

  const close = () => {
    if (!isOpen) return;
    isOpen = false;
    modal.setAttribute("aria-hidden", "true");
    if (motionAllowed()) {
      gsap.killTweensOf([modal, img]);
      gsap.to(img, { opacity: 0, scale: 0.96, duration: 0.16, ease: "power2.in" });
      gsap.to(modal, {
        autoAlpha: 0,
        duration: 0.18,
        ease: "power2.in",
        onComplete: () => {
          modal.classList.remove("is-open");
        },
      });
    } else {
      gsap.set(modal, { autoAlpha: 0 });
      modal.classList.remove("is-open");
    }
  };

  const step = (delta: number) => {
    if (items.length <= 1) return;
    index = (index + delta + items.length) % items.length;
    render(delta);
  };

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const trigger = target.closest<HTMLElement>("[data-lightbox-trigger]");
    if (trigger) {
      event.preventDefault();
      const gallery = trigger.closest("[data-lightbox-gallery]");
      if (gallery) {
        const nodes = Array.from(
          gallery.querySelectorAll<HTMLElement>("[data-lightbox-trigger]"),
        );
        const urls = nodes.map((n) => n.dataset.lightboxTrigger ?? "");
        open(urls, nodes.indexOf(trigger));
      } else {
        open([trigger.dataset.lightboxTrigger ?? ""], 0);
      }
      return;
    }

    const photo = target.closest<HTMLImageElement>(
      ".article-cover img, .prose img",
    );
    if (photo && !photo.closest("a")) {
      open([photo.currentSrc || photo.src], 0);
    }
  });

  closeBtn.addEventListener("click", close);
  prevBtn.addEventListener("click", () => step(-1));
  nextBtn.addEventListener("click", () => step(1));
  retryBtn?.addEventListener("click", () => render(0, true));
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
  document.addEventListener("keydown", (event) => {
    if (!isOpen) return;
    if (event.key === "Escape") close();
    else if (event.key === "ArrowLeft") step(-1);
    else if (event.key === "ArrowRight") step(1);
  });
}

function initReadingTime() {
  const body = document.querySelector<HTMLElement>("[data-article-body]");
  const badge = document.querySelector<HTMLElement>("[data-readtime]");
  const sep = document.querySelector<HTMLElement>("[data-readtime-sep]");
  if (!body || !badge) return;

  const raw = (body.textContent ?? "").trim();
  if (!raw) return;
  const cjk = (raw.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) ?? [])
    .length;
  const words = raw
    .replace(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  const total = cjk + words;
  if (total < 20) return;

  const mins = Math.max(1, Math.round(total / 320));
  const rounded = total >= 1000 ? `${(total / 1000).toFixed(1)}k` : `${total}`;
  badge.textContent = `约 ${rounded} 字 · ${mins} 分钟阅读`;
  badge.hidden = false;
  if (sep) sep.hidden = false;
}

function initCodeCopy() {
  if (document.documentElement.dataset.codeCopy === "false") return;
  document.querySelectorAll<HTMLElement>(".prose pre").forEach((pre) => {
    const codeEl = pre.querySelector("code");
    const langMatch = codeEl?.className.match(/language-([\w+-]+)/i);
    if (langMatch?.[1] && !pre.dataset.lang) {
      pre.dataset.lang = langMatch[1];
    }

    if (pre.querySelector(".code-copy-btn")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "code-copy-btn";
    btn.dataset.tip = "复制代码";
    btn.textContent = "复制";
    btn.addEventListener("click", async () => {
      const code = codeEl?.textContent ?? pre.textContent ?? "";
      const ok = await copyText(code);
      btn.textContent = ok ? "已复制 ✓" : "失败";
      btn.classList.toggle("is-copied", ok);
      toast(ok ? "代码已复制" : "复制失败", ok ? "success" : "warn");
      setTimeout(() => {
        btn.textContent = "复制";
        btn.classList.remove("is-copied");
      }, 1600);
    });
    pre.appendChild(btn);
  });
}

function readWidgetCommentCount(root: ParentNode): number | null {
  const candidates = root.querySelectorAll<HTMLElement>(
    "span, div, p, strong, small, header",
  );
  for (const el of candidates) {
    if (el.children.length > 1) continue;
    if (el.closest("textarea, input, [contenteditable], article, blockquote")) {
      continue;
    }
    const text = (el.textContent ?? "").trim();
    if (!text || text.length > 24) continue;
    const m = text.match(/^(\d+)\s*(?:条评论|comments?)$/i);
    if (m) return Number.parseInt(m[1], 10);
    if (/^(?:还没有评论|暂无评论|no comments?(?:\s+yet)?)$/i.test(text)) {
      return 0;
    }
  }
  return null;
}

function observeMomentCommentCount(
  drawer: HTMLElement,
  btn: HTMLButtonElement,
) {
  const countEl = btn.querySelector<HTMLElement>("[data-moment-comment-count]");
  if (!countEl) return;

  let timer: number | undefined;
  let shadowObserver: MutationObserver | null = null;
  let observedShadow: ShadowRoot | null = null;

  const updateCount = (n: number) => {
    const label = n > 0 ? String(n) : "评论";
    if (countEl.textContent?.trim() !== label) {
      countEl.textContent = label;
    }
    btn.title = `${n} 条评论`;
  };

  const scan = () => {
    if (!drawer.isConnected) {
      lightObserver.disconnect();
      shadowObserver?.disconnect();
      return;
    }
    const widget = drawer.querySelector<HTMLElement>(
      "comment-widget, comment-next, halo-comment-widget",
    );
    const sr = widget?.shadowRoot ?? null;
    if (sr && sr !== observedShadow) {
      shadowObserver?.disconnect();
      observedShadow = sr;
      shadowObserver = new MutationObserver(scheduleScan);
      shadowObserver.observe(sr, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
    const found =
      (sr ? readWidgetCommentCount(sr) : null) ??
      readWidgetCommentCount(drawer);
    if (found !== null) updateCount(found);
  };

  const scheduleScan = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(scan, 100);
  };

  const lightObserver = new MutationObserver(scheduleScan);
  lightObserver.observe(drawer, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // Initial probes while the Web Component upgrades & loads data
  window.setTimeout(scan, 150);
  window.setTimeout(scan, 650);
}

const ICONIFY_CACHE_KEY = "mote-iconify-v1";
const iconifyMemory = new Map<string, string>();
let iconifyHydrated = false;

function readIconifyCache(name: string): string | null {
  if (!iconifyHydrated) {
    iconifyHydrated = true;
    try {
      const raw = localStorage.getItem(ICONIFY_CACHE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : null;
      if (parsed && typeof parsed === "object") {
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === "string" && v.startsWith("<svg")) {
            iconifyMemory.set(k, v);
          }
        }
      }
    } catch {
      /* Storage optional. */
    }
  }
  return iconifyMemory.get(name) ?? null;
}

function writeIconifyCache(name: string, svg: string) {
  iconifyMemory.set(name, svg);
  try {
    const entries = Array.from(iconifyMemory.entries()).slice(-64);
    const obj: Record<string, string> = {};
    for (const [k, v] of entries) obj[k] = v;
    localStorage.setItem(ICONIFY_CACHE_KEY, JSON.stringify(obj));
  } catch {
    /* Storage optional. */
  }
}

function mountSafeSvg(el: HTMLElement, rawSvg: string) {
  const doc = new DOMParser().parseFromString(rawSvg, "image/svg+xml");
  const svg = doc.documentElement;
  if (!svg || svg.tagName.toLowerCase() !== "svg") return;
  svg.querySelectorAll("script, foreignObject").forEach((n) => n.remove());
  Array.from(svg.querySelectorAll("*")).concat(svg).forEach((node) => {
    Array.from(node.attributes).forEach((attr) => {
      if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
    });
  });
  svg.setAttribute("aria-hidden", "true");
  el.replaceChildren(document.importNode(svg, true));
}

function initIconifyIcons(scope: ParentNode = document) {
  const hosts = Array.from(
    scope.querySelectorAll<HTMLElement>("[data-iconify]"),
  );
  if (!hosts.length) return;

  hosts.forEach((el) => {
    const raw = (el.dataset.iconify ?? "").trim();
    if (!raw || el.dataset.iconifyLoaded === "true") return;
    if (!/^[a-z0-9-]+:[a-z0-9-]+$/i.test(raw)) return;
    el.dataset.iconifyLoaded = "true";

    const cached = readIconifyCache(raw);
    if (cached) {
      mountSafeSvg(el, cached);
      return;
    }

    const [prefix, icon] = raw.split(":");
    const url = `https://api.iconify.design/${encodeURIComponent(prefix)}/${encodeURIComponent(icon)}.svg?height=16`;
    void fetch(url, { mode: "cors", credentials: "omit" })
      .then((res) => (res.ok ? res.text() : ""))
      .then((svgText) => {
        const trimmed = svgText.trim();
        if (!trimmed.startsWith("<svg")) return;
        writeIconifyCache(raw, trimmed);
        if (el.isConnected) mountSafeSvg(el, trimmed);
      })
      .catch(() => {
        /* Keep clean text-only fallback if offline. */
      });
  });
}

/** Mounted once for the lifetime of the document. */
export function initMoteGlobal() {
  initLightbox();
  initIconifyIcons();
  document.addEventListener("mote:reader-sync", syncReaderControls);

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const upvoteBtn = target.closest<HTMLButtonElement>("[data-upvote]");
    if (upvoteBtn) {
      if (event.detail > 0) upvoteBtn.blur();
      void handleUpvoteClick(upvoteBtn);
      return;
    }
    const rainBtn = target.closest<HTMLElement>("[data-rain-toggle]");
    if (rainBtn) {
      toggleRainAudio();
      if (event.detail > 0) rainBtn.blur();
      return;
    }
    const fontBtn = target.closest<HTMLElement>("[data-prose-font-toggle]");
    if (fontBtn) {
      toggleProseFont();
      if (event.detail > 0) fontBtn.blur();
      return;
    }
    const fontPick = target.closest<HTMLElement>("[data-prose-font-pick]");
    if (fontPick) {
      const pick = fontPick.dataset.proseFontPick;
      if (pick === "sans" || pick === "serif") setProseFont(pick);
      if (event.detail > 0) fontPick.blur();
      return;
    }
    const sizeBtn = target.closest<HTMLElement>("[data-prose-size-cycle]");
    if (sizeBtn) {
      cycleProseSize();
      if (event.detail > 0) sizeBtn.blur();
      return;
    }
    const sizePick = target.closest<HTMLElement>("[data-prose-size-pick]");
    if (sizePick) {
      const pick = sizePick.dataset.proseSizePick as ProseSize | undefined;
      if (pick && pick in PROSE_SIZE_META) setProseSize(pick);
      if (event.detail > 0) sizePick.blur();
      return;
    }
    if (target.closest("[data-random-trigger]")) {
      if (!openRandomPost()) toast("还没有其他文章");
      return;
    }
    const copyBtn = target.closest<HTMLElement>("[data-copy-link]");
    if (copyBtn) {
      if (event.detail > 0) copyBtn.blur();
      void copyText(location.href).then((ok) =>
        toast(ok ? "链接已复制" : "复制失败", ok ? "success" : "warn"),
      );
      return;
    }
    const citeBtn = target.closest<HTMLElement>("[data-copy-citation]");
    if (citeBtn) {
      if (event.detail > 0) citeBtn.blur();
      const title = (citeBtn.dataset.citeTitle ?? document.title).trim();
      const author = (citeBtn.dataset.citeAuthor ?? "").trim();
      const date = (citeBtn.dataset.citeDate ?? "").trim();
      const metaParts = [author, date ? `发布于 ${date}` : ""].filter(Boolean);
      const citation = `「${title}」${metaParts.length ? ` — ${metaParts.join("，")}` : ""}，原文链接：${location.href}`;
      void copyText(citation).then((ok) =>
        toast(ok ? "已复制引用信息" : "复制失败", ok ? "success" : "warn"),
      );
      return;
    }
    const emailBtn = target.closest<HTMLElement>("[data-copy-email]");
    if (emailBtn) {
      if (event.detail > 0) emailBtn.blur();
      const email = emailBtn.dataset.copyEmail ?? "";
      if (email) {
        void copyText(email).then((ok) => {
          toast(ok ? `已复制邮箱：${email}` : "复制失败", ok ? "success" : "warn");
          if (ok) {
            emailBtn.classList.add("is-copied");
            window.setTimeout(() => emailBtn.classList.remove("is-copied"), 1600);
          }
        });
      }
      return;
    }
    const momentCommentBtn = target.closest<HTMLButtonElement>(
      "[data-moment-comment-toggle]",
    );
    if (momentCommentBtn) {
      const card = momentCommentBtn.closest<HTMLElement>(".moment");
      const drawer = card?.querySelector<HTMLElement>(
        "[data-moment-comment-drawer]",
      );
      if (drawer) {
        const willOpen = drawer.hidden;
        if (willOpen && drawer.dataset.mounted !== "true") {
          const tpl = card?.querySelector<HTMLTemplateElement>(
            "[data-moment-comment-tpl]",
          );
          if (tpl) {
            const frag = document.importNode(tpl.content, true);
            const scripts = Array.from(frag.querySelectorAll("script"));
            scripts.forEach((oldScript) => {
              const s = document.createElement("script");
              Array.from(oldScript.attributes).forEach((attr) =>
                s.setAttribute(attr.name, attr.value),
              );
              s.textContent = oldScript.textContent;
              oldScript.replaceWith(s);
            });
            drawer.append(frag);
            drawer.dataset.mounted = "true";
            observeMomentCommentCount(drawer, momentCommentBtn);
          }
        }
        drawer.hidden = !willOpen;
        momentCommentBtn.classList.toggle("is-active", willOpen);
        momentCommentBtn.setAttribute("aria-expanded", String(willOpen));
      }
      return;
    }
    const momentBody = target.closest<HTMLElement>("[data-moment-clickable]");
    if (
      momentBody &&
      !target.closest("a, button, img, video, audio") &&
      !window.getSelection()?.toString()
    ) {
      const detailLink = momentBody
        .closest(".moment")
        ?.querySelector<HTMLAnchorElement>("a.moment-time, a.moment-comments");
      detailLink?.click();
    }
  });
}

function initPhotoGroupFilter() {
  const tabs = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-photo-filter]"),
  );
  const groups = Array.from(
    document.querySelectorAll<HTMLElement>("[data-photo-group]"),
  );
  if (!tabs.length || !groups.length) return;

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.photoFilter ?? "all";
      if (tab.classList.contains("is-active")) return;
      tabs.forEach((btn) => {
        const active = btn === tab;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-pressed", String(active));
      });
      groups.forEach((group) => {
        group.hidden =
          target !== "all" && group.dataset.photoGroup !== target;
      });
    });
  });
}

function initOutdatedNotice() {
  const el = document.querySelector<HTMLElement>("[data-outdated-notice]");
  const textEl = el?.querySelector<HTMLElement>("[data-outdated-text]");
  if (!el || !textEl) return;

  const mode = (el.dataset.outdatedMode ?? "auto").trim();
  if (mode === "hide") {
    el.hidden = true;
    return;
  }

  const rawTime = (el.dataset.publishTime ?? "").trim();
  const parsedMs = rawTime ? Date.parse(rawTime) : Number.NaN;
  const thresholdDays = Number.parseInt(el.dataset.outdatedDays ?? "180", 10);
  const ageDays = Number.isNaN(parsedMs)
    ? 0
    : Math.floor((Date.now() - parsedMs) / (24 * 60 * 60 * 1000));

  const shouldShow =
    mode === "show" ||
    (mode === "auto" &&
      Number.isFinite(thresholdDays) &&
      thresholdDays > 0 &&
      ageDays >= thresholdDays);

  if (!shouldShow) {
    el.hidden = true;
    return;
  }

  let spanLabel = "";
  if (ageDays >= 365) {
    spanLabel = `${Math.floor(ageDays / 365)} 年前`;
  } else if (ageDays >= 30) {
    spanLabel = `${Math.floor(ageDays / 30)} 个月前`;
  } else if (ageDays > 0) {
    spanLabel = `${ageDays} 天前`;
  }

  textEl.textContent = spanLabel
    ? `写于 ${spanLabel}，部分内容可能已有变化。`
    : "这篇写得比较早，部分内容可能已有变化。";
  el.hidden = false;
}

function initArticleTldr() {
  const wrap = document.querySelector<HTMLElement>("[data-article-tldr]");
  const textEl = wrap?.querySelector<HTMLElement>("[data-article-tldr-text]");
  if (!wrap || !textEl) return;

  const lines = (textEl.textContent ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•·]|\d+[.)、])\s*/, "").trim())
    .filter(Boolean);

  if (lines.length <= 1) return;

  const list = document.createElement("ul");
  list.className = "article-tldr-list";
  for (const line of lines) {
    const li = document.createElement("li");
    li.textContent = line;
    list.append(li);
  }
  textEl.replaceWith(list);
}

function initEquipmentGroupFilter() {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-eq-filter]"),
  );
  const groups = Array.from(
    document.querySelectorAll<HTMLElement>("[data-eq-group]"),
  );
  if (buttons.length === 0 || groups.length === 0) return;

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.eqFilter ?? "all";
      buttons.forEach((b) => {
        const active = b === btn;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-pressed", String(active));
      });
      groups.forEach((group) => {
        group.hidden =
          target !== "all" && group.dataset.eqGroup !== target;
      });
    });
  });
}

function initSponsorModal(): () => void {
  const modal = document.querySelector<HTMLElement>("[data-sponsor-modal]");
  const trigger = document.querySelector<HTMLButtonElement>("[data-sponsor-open]");
  if (!modal || !trigger) return () => {};

  const overlay = createOverlay(modal);
  const controller = new AbortController();

  trigger.addEventListener(
    "click",
    () => overlay.open(trigger),
    { signal: controller.signal },
  );

  const tabs = Array.from(
    modal.querySelectorAll<HTMLButtonElement>("[data-sponsor-tab]"),
  );
  const panels = Array.from(
    modal.querySelectorAll<HTMLElement>("[data-sponsor-panel]"),
  );

  tabs.forEach((tab) => {
    tab.addEventListener(
      "click",
      () => {
        const key = tab.dataset.sponsorTab;
        if (!key) return;
        tabs.forEach((t) => {
          const active = t === tab;
          t.classList.toggle("is-active", active);
          t.setAttribute("aria-selected", String(active));
        });
        panels.forEach((p) => {
          p.hidden = p.dataset.sponsorPanel !== key;
        });
      },
      { signal: controller.signal },
    );
  });

  return () => {
    controller.abort();
    overlay.close();
  };
}

/** Mounted on initial load and after every Swup page swap. */
export function initMotePage(): () => void {
  let disposed = false;
  const asyncCleanups: Array<() => void> = [];

  const mountLazy = (
    selector: string,
    loader: () => Promise<() => void>,
  ) => {
    if (!document.querySelector(selector)) return;
    void loader().then((cleanup) => {
      if (disposed) {
        cleanup();
      } else {
        asyncCleanups.push(cleanup);
      }
    });
  };

  initIconifyIcons(document.getElementById("main") ?? document);
  initCategoryFilter();
  initPhotoGroupFilter();
  initEquipmentGroupFilter();
  mountLazy("[data-archive-root]", () =>
    import("./archives").then((m) => m.initArchives()),
  );
  mountLazy("[data-quick-filter], [data-list-root]", () =>
    import("./list-enhancements").then((m) => m.initListEnhancements()),
  );
  mountLazy("[data-link-modal]", () =>
    import("./link-apply").then((m) => m.initLinkApply()),
  );
  mountLazy("[data-friends-page]", () =>
    import("./link-feeds").then((m) => m.initLinkFeeds()),
  );
  mountLazy("[data-douban-root]", () =>
    import("./douban").then((m) => m.initDouban()),
  );
  mountLazy("[data-share-modal]", () =>
    import("./share-card").then((m) => m.initShareCard()),
  );
  const cleanupCoverPalette = initCoverPalette();
  const cleanupSponsor = initSponsorModal();
  initExcerptToggle();
  initReadingTime();
  initOutdatedNotice();
  initArticleTldr();
  syncRainButtons();
  syncReaderControls();
  syncUpvotedButtons();
  initCodeCopy();
  const cleanupHoverPreview = initHoverCoverPreview();
  return () => {
    disposed = true;
    asyncCleanups.forEach((fn) => fn());
    asyncCleanups.length = 0;
    cleanupCoverPalette();
    cleanupSponsor();
    cleanupHoverPreview();
  };
}
