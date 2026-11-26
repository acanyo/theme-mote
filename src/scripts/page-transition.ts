/**
 * Cross-document fades. The inline head handles incoming transitions;
 * this module cancels outgoing transitions when motion is off.
 */
import { motionAllowed } from "./motion";

interface PageSwapEvent extends Event {
  viewTransition: ViewTransition | null;
}

export function initPageTransition() {
  const root = document.documentElement;
  const enabled = () =>
    motionAllowed() && root.dataset.pageTransition !== "false";

  window.addEventListener("pageswap", (event) => {
    const { viewTransition } = event as PageSwapEvent;
    if (viewTransition && !enabled()) viewTransition.skipTransition();
  });
}
