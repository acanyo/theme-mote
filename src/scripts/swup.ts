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

export function initSwup(onMountPage: () => void, onTeardownPage: () => void) {
  if (document.documentElement.dataset.pageTransition === "false") return null;

  const swup = new Swup({
    containers: ["#main"],
    animationSelector: '[class*="transition-"]',
    cache: true,
    ignoreVisit: (url, { el } = {}) => shouldIgnore(url, el),
    plugins: [
      new SwupHeadPlugin({
        persistAssets: true,
        awaitAssets: true,
      }),
      new SwupPreloadPlugin({
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

  swup.hooks.on("visit:start", (visit) => {
    if (!motionAllowed()) {
      visit.animation.animate = false;
    }
  });

  swup.hooks.before("content:replace", () => {
    onTeardownPage();
  });

  swup.hooks.on("content:replace", (visit) => {
    const nextPage = visit.to.document?.body?.dataset.page;
    if (nextPage) {
      document.body.dataset.page = nextPage;
    }
    runMainScripts();
  });

  swup.hooks.on("page:view", () => {
    onMountPage();
  });

  setNavigator((url) => {
    void swup.navigate(url);
  });

  return swup;
}
