import { initMotionToggle } from "./motion";
import { initScheme } from "./scheme";
import { initNav } from "./nav";
import { initProgressDrop } from "./progress";
import { initPageTransition } from "./page-transition";
import { initSearch } from "./search";
import { initSince } from "./since";
import { initControlCenter } from "./control-center";
import { initShortcuts } from "./shortcuts";
import { initImageCursor } from "./image-cursor";
import {
  initImagePlaceholdersGlobal,
  initImagePlaceholdersPage,
} from "./image-placeholder";
import { initTooltip } from "./tooltip";
import { initMoteGlobal, initMotePage } from "./mote";
import { initUserMenu } from "./user";
import { initSwup } from "./swup";
import { animatePageEnter } from "./animation/mote-motion";

export function initSite() {
  initMotionToggle();
  initScheme();
  const nav = initNav();
  initSearch();
  const progress = initProgressDrop();
  initPageTransition();
  initImagePlaceholdersGlobal();
  initMoteGlobal();
  initUserMenu();
  const imageCursor = initImageCursor();
  const tooltip = initTooltip();

  let help: ReturnType<typeof initShortcuts> = null;
  const controlCenter = initControlCenter(() => help?.open());
  const openControlCenter = () =>
    controlCenter?.open(document.querySelector<HTMLElement>("[data-cc-open]"));
  help = initShortcuts(openControlCenter);

  let cleanups: Array<() => void> = [];

  const teardownPage = () => {
    imageCursor?.hide();
    tooltip?.hide();
    cleanups.forEach((fn) => fn());
    cleanups = [];
  };

  const mountPage = (isSwupVisit = false) => {
    teardownPage();
    nav?.syncPage();
    progress.refresh();
    initSince();
    cleanups.push(initImagePlaceholdersPage());
    cleanups.push(initMotePage());
    if (isSwupVisit) {
      cleanups.push(animatePageEnter());
    }

    const article = document.querySelector<HTMLElement>("[data-article-body]");
    const toc = document.querySelector<HTMLElement>("[data-toc]");
    if (article && toc) {
      void import("./toc").then(({ initToc }) => {
        if (!article.isConnected || !toc.isConnected) return;
        cleanups.push(initToc(article, toc));
      });
    }
  };

  mountPage(false);
  initSwup(() => mountPage(true), teardownPage);
}
