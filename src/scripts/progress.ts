/** Drives the article top reading progress hairline, TOC percentage, and delegated back-to-top buttons. */
export interface ProgressController {
  refresh: () => void;
}

export function initProgressDrop(): ProgressController {
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const btn = target.closest<HTMLButtonElement>("[data-scroll-top]");
    if (!btn) return;
    btn.blur();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  let frame = 0;
  let lastPct = -1;
  let lastScrollY = window.scrollY;

  const update = () => {
    frame = 0;
    const bar = document.querySelector<HTMLElement>("[data-progress-bar]");
    const tocPcts = document.querySelectorAll<HTMLElement>("[data-toc-pct]");
    const pctBadges = document.querySelectorAll<HTMLElement>(
      "[data-scroll-pct-badge]",
    );
    const floatDock = document.querySelector<HTMLElement>(
      "[data-mobile-float-dock]",
    );
    const y = Math.max(0, window.scrollY);
    const delta = y - lastScrollY;
    lastScrollY = y;
    const docMax = document.documentElement.scrollHeight - window.innerHeight;
    let p = 0;

    if (docMax <= 0) {
      p = 0;
    } else if (y >= docMax - 4) {
      p = 1;
    } else {
      const article = document.querySelector<HTMLElement>("[data-article-body]");
      if (article) {
        const rect = article.getBoundingClientRect();
        const articleEndY = y + rect.bottom;
        const readingTarget = Math.min(
          docMax,
          Math.max(1, articleEndY - window.innerHeight * 0.55),
        );
        p = Math.min(Math.max(y / readingTarget, 0), 1);
      } else {
        p = Math.min(Math.max(y / docMax, 0), 1);
      }
    }

    if (bar) bar.style.setProperty("--p", p.toFixed(4));
    const pct = Math.round(p * 100);
    const text = `${pct}%`;
    const badgeText = pct >= 98 ? "↑" : `${pct}`;

    if (pct !== lastPct) {
      lastPct = pct;
      tocPcts.forEach((el) => {
        el.textContent = text;
      });
      pctBadges.forEach((el) => {
        el.textContent = badgeText;
      });
    } else {
      tocPcts.forEach((el) => {
        if (el.textContent === "0%" && pct !== 0) el.textContent = text;
      });
      pctBadges.forEach((el) => {
        if (el.textContent === "0" && pct !== 0) el.textContent = badgeText;
      });
    }

    if (floatDock) {
      if (y <= 180 || docMax <= 260) {
        floatDock.classList.remove("is-visible");
      } else if (delta > 8) {
        floatDock.classList.remove("is-visible");
      } else if (delta < -6) {
        floatDock.classList.add("is-visible");
      }
    }
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  update();

  return {
    refresh: () => {
      lastPct = -1;
      lastScrollY = window.scrollY;
      document
        .querySelector<HTMLElement>("[data-mobile-float-dock]")
        ?.classList.remove("is-visible");
      update();
    },
  };
}
