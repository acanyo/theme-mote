/**
 * Swup 4 SPA-like page transitions for Halo SSR pages.
 * - Swaps #main while keeping Header, Footer, ControlCenter, Lightbox & Rain Audio mounted
 * - Loads & awaits per-page Astro CSS chunks via @swup/head-plugin (zero FOUC)
 * - Preloads hovered internal links via @swup/preload-plugin
 * - Syncs body[data-page] & re-executes scripts inside #main (comments, custom intro JS)
 * - Respects theme.config.motion.page_transition and reduced-motion preferences
 */
import Swup from "swup";
import SwupHeadPlugin from "@swup/head-plugin";
import SwupPreloadPlugin from "@swup/preload-plugin";
import SwupScrollPlugin from "@swup/scroll-plugin";
import { setNavigator } from "./actions";
import { motionAllowed } from "./motion";

const EXCLUDED_PREFIXES = [
  "/console",
  "/uc",
  "/login",
  "/logout",
  "/oauth2",
  "/apis/",
  "/api/",
  "/upload/",
  "/themes/",
];

const EXCLUDED_EXTENSIONS =
  /\.(xml|json|rss|atom|pdf|zip|gz|tar|png|jpe?g|webp|gif|svg|ico|mp4|webm|mp3|wav)$/i;

function shouldIgnore(url: string, el?: Element | null): boolean {
  if (el?.closest("[data-no-swup], [download], [target='_blank']")) return true;
  try {
    const parsed = new URL(url, location.href);
    if (parsed.origin !== location.origin) return true;
    const path = parsed.pathname;
    if (EXCLUDED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(prefix))) {
      return true;
    }
    if (EXCLUDED_EXTENSIONS.test(path)) return true;
  } catch {
    return true;
  }
  return false;
}

function runMainScripts() {
  const main = document.getElementById("main");
  if (!main) return;
  main.querySelectorAll("script").forEach((oldScript) => {
    if (
      oldScript.type &&
      !/^(text\/javascript|application\/javascript|module)$/i.test(
        oldScript.type,
      )
    ) {
      return;
    }
    const next = document.createElement("script");
    Array.from(oldScript.attributes).forEach((attr) =>
      next.setAttribute(attr.name, attr.value),
    );
    next.textContent = oldScript.textContent;
    oldScript.replaceWith(next);
  });
}

type ContentWidgetsGlobal = {
  mount?: (root?: ParentNode) => void;
};

let pendingContentWidgetsSrc = "";

function captureExternalPluginScripts(doc?: Document | null) {
  if (!doc) return;
  const loader = doc.querySelector<HTMLScriptElement>(
    'script[src*="content-widgets-loader"]',
  );
  if (loader?.src) {
    pendingContentWidgetsSrc = loader.src;
  }
}

type BarrageHostElement = HTMLElement & {
  isVisible?: boolean;
  stop?: () => void;
};

function cleanupTeleportedPluginOverlays() {
  // Plugins like comment-interact (<xhhao-barrage>) teleport their element from #main
  // onto document.body via setTimeout(..., 0), so Swup replacing #main leaves them active.
  document
    .querySelectorAll<BarrageHostElement>("xhhao-barrage, comment-barrage")
    .forEach((el) => {
      el.dataset.moteDisposed = "1";
      try {
        el.isVisible = false;
        el.stop?.();
        const inner =
          el.shadowRoot?.querySelector<BarrageHostElement>("comment-barrage");
        inner?.stop?.();
      } catch {
        /* Ignore plugin-internal errors */
      }
      el.remove();
    });
}

function purgeDisposedPluginOverlays() {
  document
    .querySelectorAll<BarrageHostElement>('[data-mote-disposed="1"]')
    .forEach((el) => {
      try {
        el.isVisible = false;
        el.stop?.();
        const inner =
          el.shadowRoot?.querySelector<BarrageHostElement>("comment-barrage");
        inner?.stop?.();
      } catch {
        /* Ignore plugin-internal errors */
      }
      el.remove();
    });
}

function remountContentWidgets(root: ParentNode) {
  const win = window as Window & {
    XhhaoComContentWidgets?: ContentWidgetsGlobal;
  };
  if (typeof win.XhhaoComContentWidgets?.mount === "function") {
    try {
      win.XhhaoComContentWidgets.mount(root);
    } catch {
      /* Ignore plugin-internal errors */
    }
    return;
  }

  const hasWidgetTags = Array.from(root.querySelectorAll("*")).some((el) =>
    el.tagName.toLowerCase().startsWith("xhhao-com-"),
  );
  if (!hasWidgetTags || !pendingContentWidgetsSrc) return;

  const src = pendingContentWidgetsSrc;
  const existing = document.querySelector<HTMLScriptElement>(
    `script[data-mote-plugin-loader="${CSS.escape(src)}"]`,
  );
  if (existing) return;

  const script = document.createElement("script");
  script.type = "module";
  script.src = src;
  script.dataset.motePluginLoader = src;
  script.addEventListener(
    "load",
    () => {
      try {
        win.XhhaoComContentWidgets?.mount?.(
          document.getElementById("main") ?? document,
        );
      } catch {
        /* Ignore plugin-internal errors */
      }
    },
    { once: true },
  );
  document.head.append(script);
}

const preloadedStyleUrls = new Set<string>();

function preloadStylesFromHtml(html?: string) {
  if (!html) return;
  const regex =
    /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>|<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']stylesheet["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const href = (match[1] || match[2] || "").trim();
    if (!href || preloadedStyleUrls.has(href)) continue;
    let isSameOrigin = false;
    try {
      isSameOrigin = new URL(href, location.href).origin === location.origin;
    } catch {
      continue;
    }
    if (!isSameOrigin) continue;
    if (document.head.querySelector(`link[href="${CSS.escape(href)}"]`)) {
      preloadedStyleUrls.add(href);
      continue;
    }
    preloadedStyleUrls.add(href);
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "style";
    link.href = href;
    document.head.append(link);
  }
}

function extractDestinationLabel(triggerEl?: Element | null): string {
  if (!triggerEl) return "正在切换页面…";
  const raw =
    triggerEl
      .querySelector<HTMLElement>(
        ".post-row-title, .nav-label, .tabbar-label, .fp-row-title, .post-nav-title",
      )
      ?.textContent?.trim() ||
    triggerEl.textContent?.replace(/\s+/g, " ").trim() ||
    triggerEl.getAttribute("aria-label")?.trim() ||
    "";
  const cleaned = raw.replace(/[→←↑↓·]/g, "").trim();
  if (!cleaned) return "正在前往…";
  const short =
    Array.from(cleaned).length > 11
      ? `${Array.from(cleaned).slice(0, 10).join("")}…`
      : cleaned;
  return `前往 ${short}`;
}

function createNavProgress() {
  const wrap = document.querySelector<HTMLElement>("[data-nav-progress]");
  const bar = wrap?.querySelector<HTMLElement>("[data-nav-progress-bar]");
  const loader = document.querySelector<HTMLElement>("[data-nav-loader]");
  const loaderText = loader?.querySelector<HTMLElement>("[data-nav-loader-text]");
  if (!wrap || !bar) {
    return { start: (_el?: Element | null) => {}, done: () => {} };
  }

  let showTimer = 0;
  let trickleTimer = 0;
  let hideTimer = 0;
  let active = false;
  let progress = 0;

  const setProgress = (val: number) => {
    progress = val;
    bar.style.setProperty("--nav-p", String(val));
  };

  const clearTimers = () => {
    window.clearTimeout(showTimer);
    window.clearInterval(trickleTimer);
    window.clearTimeout(hideTimer);
    showTimer = 0;
    trickleTimer = 0;
    hideTimer = 0;
  };

  const start = (triggerEl?: Element | null) => {
    clearTimers();
    active = false;
    wrap.classList.remove("is-active");
    loader?.classList.remove("is-active");
    if (loaderText) loaderText.textContent = extractDestinationLabel(triggerEl);
    setProgress(0);

    // 120ms delay prevents any flash on hover-preloaded instant transitions
    showTimer = window.setTimeout(() => {
      active = true;
      wrap.classList.add("is-active");
      loader?.classList.add("is-active");
      setProgress(0.28);
      trickleTimer = window.setInterval(() => {
        if (!active) return;
        const step = (0.88 - progress) * 0.18;
        if (step > 0.005) setProgress(Math.min(0.88, progress + step));
      }, 180);
    }, 120);
  };

  const done = () => {
    window.clearTimeout(showTimer);
    window.clearInterval(trickleTimer);
    showTimer = 0;
    trickleTimer = 0;
    loader?.classList.remove("is-active");
    if (!active) return;
    active = false;
    setProgress(1);
    hideTimer = window.setTimeout(() => {
      wrap.classList.remove("is-active");
      window.setTimeout(() => {
        if (!active) setProgress(0);
      }, 220);
    }, 160);
  };

  return { start, done };
}

export function initSwup(onMountPage: () => void, onTeardownPage: () => void) {
  if (document.documentElement.dataset.pageTransition === "false") return null;

  const navProgress = createNavProgress();

  const swup = new Swup({
    containers: ["#main"],
    animationSelector: '[class*="transition-"]',
    cache: true,
    ignoreVisit: (url, { el } = {}) => shouldIgnore(url, el),
    plugins: [
      new SwupHeadPlugin({
        persistAssets: true,
        awaitAssets: true,
        timeout: 1500,
      }),
      new SwupPreloadPlugin({
        throttle: 2,
        preloadInitialPage: false,
        preloadHoveredLinks: true,
        preloadVisibleLinks: false,
      }),
      new SwupScrollPlugin({
        doScrollingRightAway: false,
        animateScroll: {
          betweenPages: false,
          samePageWithHash: true,
          samePage: true,
        },
      }),
    ],
  });

  let isNavigating = false;
  let warmupRunId = 0;

  swup.hooks.on("page:preload", (_visit, args) => {
    preloadStylesFromHtml(args?.page?.html);
  });

  swup.hooks.on("visit:start", (visit) => {
    isNavigating = true;
    warmupRunId += 1;
    navProgress.start(visit.trigger.el);
    if (!motionAllowed()) {
      visit.animation.animate = false;
    }
  });

  swup.hooks.before("content:replace", () => {
    cleanupTeleportedPluginOverlays();
    onTeardownPage();
  });

  swup.hooks.on("content:replace", (visit) => {
    const nextPage = visit.to.document?.body?.dataset.page;
    if (nextPage) {
      document.body.dataset.page = nextPage;
    }
    captureExternalPluginScripts(visit.to.document);
  });

  swup.hooks.on("page:view", () => {
    isNavigating = false;
    navProgress.done();
    purgeDisposedPluginOverlays();
    onMountPage();
    requestAnimationFrame(() => {
      purgeDisposedPluginOverlays();
      const main = document.getElementById("main") ?? document;
      runMainScripts();
      remountContentWidgets(main);
      document.dispatchEvent(new CustomEvent("pjax:complete"));
    });
  });

  swup.hooks.on("visit:end", () => {
    isNavigating = false;
    navProgress.done();
  });

  setNavigator((url) => {
    void swup.navigate(url);
  });

  // Pointerdown head-start (~80-150ms before click completes on desktop & hybrid devices)
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const target = e.target as Element | null;
      const anchor = target?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      if (!href || href.startsWith("#") || shouldIgnore(href, anchor)) return;
      void swup.preload?.(anchor, { priority: true });
    },
    { passive: true, capture: true },
  );

  // Sequential, cancellable intent-based preloading (never floods server or traps clicks in queue):
  // 1) Opening a desktop dropdown (.nav-item.has-sub) or mobile TabBar submenu warms up to 6 child links 1-by-1
  // 2) After 2s idle, gently warms top 3 recent posts / post-nav links 1-by-1 (respects saveData)
  const saveData = Boolean(
    (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection?.saveData,
  );
  if (!saveData) {
    const warmedUrls = new Set<string>();
    const wait = (ms: number) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, ms));

    const runSequentialWarmup = async (
      anchors: HTMLAnchorElement[],
      initialDelayMs: number,
      gapMs: number,
    ) => {
      const runId = ++warmupRunId;
      if (initialDelayMs > 0) await wait(initialDelayMs);
      for (const anchor of anchors) {
        if (
          runId !== warmupRunId ||
          isNavigating ||
          document.visibilityState !== "visible"
        ) {
          return;
        }
        const href = anchor.getAttribute("href") ?? "";
        if (!href || href.startsWith("#") || shouldIgnore(href, anchor)) {
          continue;
        }
        let key = "";
        try {
          key = new URL(href, location.href).pathname;
        } catch {
          continue;
        }
        if (key === location.pathname || warmedUrls.has(key)) continue;
        warmedUrls.add(key);
        try {
          await swup.preload?.(anchor, { priority: false });
        } catch {
          /* Ignore background preload failures */
        }
        if (gapMs > 0) await wait(gapMs);
      }
    };

    document
      .querySelectorAll<HTMLElement>(".site-header .nav-item.has-sub")
      .forEach((item) => {
        item.addEventListener("mouseenter", () => {
          const links = Array.from(
            item.querySelectorAll<HTMLAnchorElement>(".nav-sub a[href]"),
          ).slice(0, 6);
          if (links.length) void runSequentialWarmup(links, 160, 220);
        });
      });

    document
      .querySelectorAll<HTMLButtonElement>("[data-tabbar-sub]")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const panelId = btn.dataset.tabbarSub;
          if (!panelId) return;
          const panel = document.querySelector<HTMLElement>(
            `[data-tabbar-panel="${CSS.escape(panelId)}"]`,
          );
          if (!panel) return;
          const links = Array.from(
            panel.querySelectorAll<HTMLAnchorElement>("a[href]"),
          ).slice(0, 6);
          if (links.length) void runSequentialWarmup(links, 120, 220);
        });
      });

    const scheduleIdleWarmup = () => {
      const candidates = Array.from(
        document.querySelectorAll<HTMLAnchorElement>(
          "#main .home-writing .post-row[href], #main .post-nav a[href]",
        ),
      ).slice(0, 3);
      if (!candidates.length) return;
      void runSequentialWarmup(candidates, 2000, 350);
    };

    const runIdle = () => {
      const ric = (
        window as Window & {
          requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void;
        }
      ).requestIdleCallback;
      if (ric) ric(scheduleIdleWarmup, { timeout: 3000 });
      else window.setTimeout(scheduleIdleWarmup, 1800);
    };

    runIdle();
    swup.hooks.on("page:view", runIdle);
  }

  return swup;
}
