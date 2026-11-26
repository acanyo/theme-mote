/**
 * Archives page enhancements:
 * - Computes accurate per-year article counts
 * - Instant client-side title/category filter
 * - Progressive infinite / load-more pagination that fetches Halo's next archive page
 *   and merges boundary years & months seamlessly with zero duplicate headers
 */
import { gsap, settleEase } from "./animation/engine";
import { motionAllowed } from "./motion";

export function initArchives(): () => void {
  const root = document.querySelector<HTMLElement>("[data-archive-root]");
  const yearsWrap = root?.querySelector<HTMLElement>("[data-archive-list]");
  if (!root || !yearsWrap) return () => {};

  const filterInput = document.querySelector<HTMLInputElement>(
    "[data-archive-filter]",
  );
  const filterWrap = filterInput?.closest<HTMLElement>(".archive-search-wrap");
  const filterCount = document.querySelector<HTMLElement>(
    "[data-archive-filter-count]",
  );
  const filterEmpty = root.querySelector<HTMLElement>(
    "[data-archive-filter-empty]",
  );
  const yearNav = root.querySelector<HTMLElement>("[data-archive-year-nav]");
  const loader = root.querySelector<HTMLElement>("[data-archive-loader]");
  const loadBtn = loader?.querySelector<HTMLButtonElement>(
    "[data-archive-load-btn]",
  );
  const loadLabel = loader?.querySelector<HTMLElement>(
    "[data-archive-load-label]",
  );
  const loadMeta = loader?.querySelector<HTMLElement>(
    "[data-archive-load-meta]",
  );
  const fallbackPagination = root.querySelector<HTMLElement>(
    "[data-archive-pagination]",
  );

  const syncYearCounts = () => {
    yearsWrap
      .querySelectorAll<HTMLElement>(".archive-year")
      .forEach((yearEl) => {
        const countEl = yearEl.querySelector<HTMLElement>("[data-year-count]");
        const visibleCount = yearEl.querySelectorAll(
          ".archive-post-item:not([hidden])",
        ).length;
        if (countEl) countEl.textContent = `${visibleCount} 篇`;
      });
  };

  const applyFilter = () => {
    const query = (filterInput?.value ?? "").trim().toLowerCase();
    let totalVisible = 0;

    yearsWrap
      .querySelectorAll<HTMLElement>(".archive-year")
      .forEach((yearEl) => {
        let yearVisible = 0;
        yearEl
          .querySelectorAll<HTMLElement>(".archive-month")
          .forEach((monthEl) => {
            let monthVisible = 0;
            monthEl
              .querySelectorAll<HTMLElement>(".archive-post-item")
              .forEach((item) => {
                const text = (
                  item.dataset.searchText ??
                  item.textContent ??
                  ""
                ).toLowerCase();
                const match = !query || text.includes(query);
                item.hidden = !match;
                if (match) monthVisible += 1;
              });
            monthEl.hidden = monthVisible === 0;
            yearVisible += monthVisible;
          });
        yearEl.hidden = yearVisible === 0;
        totalVisible += yearVisible;
      });

    syncYearCounts();

    if (filterEmpty) {
      filterEmpty.hidden = !query || totalVisible > 0;
    }
    if (filterCount && filterWrap) {
      if (query) {
        filterCount.textContent = `${totalVisible} 篇`;
        filterCount.hidden = false;
        filterWrap.classList.add("has-count");
      } else {
        filterCount.hidden = true;
        filterWrap.classList.remove("has-count");
      }
    }
  };

  filterInput?.addEventListener("input", applyFilter);
  syncYearCounts();

  /* Progressive Lazy Load-More (only activates when Halo reports hasNext) */
  let observer: IntersectionObserver | null = null;
  let loading = false;

  if (loader && loadBtn) {
    /* Hide classic prev/next pagination once JS seamless loader takes over */
    if (fallbackPagination) fallbackPagination.hidden = true;

    const loadMore = async () => {
      const nextUrl = loader.dataset.nextUrl?.trim();
      if (!nextUrl || loading) return;
      loading = true;
      loadBtn.disabled = true;
      if (loadLabel) loadLabel.textContent = "加载中…";

      try {
        const res = await fetch(nextUrl, {
          headers: { "X-Requested-With": "fetch" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const incomingYears = Array.from(
          doc.querySelectorAll<HTMLElement>("[data-archive-list] .archive-year"),
        );

        const appended: HTMLElement[] = [];

        incomingYears.forEach((incYear) => {
          const yearVal = incYear.dataset.year;
          const existingYear = yearVal
            ? yearsWrap.querySelector<HTMLElement>(
                `.archive-year[data-year="${CSS.escape(yearVal)}"]`,
              )
            : null;

          if (!existingYear) {
            const imported = document.importNode(incYear, true);
            yearsWrap.appendChild(imported);
            appended.push(
              ...Array.from(
                imported.querySelectorAll<HTMLElement>(".archive-post-item"),
              ),
            );
            if (yearNav && yearVal) {
              const pill = document.createElement("a");
              pill.className = "archive-year-pill num";
              pill.href = `#year-${yearVal}`;
              pill.textContent = yearVal;
              yearNav.appendChild(pill);
            }
            return;
          }

          /* Same year spans across pagination boundary: merge months cleanly */
          const existingMonths =
            existingYear.querySelector<HTMLElement>(".archive-months");
          incYear
            .querySelectorAll<HTMLElement>(".archive-month")
            .forEach((incMonth) => {
              const monthVal = incMonth.dataset.month;
              const existingMonth = monthVal
                ? existingYear.querySelector<HTMLElement>(
                    `.archive-month[data-month="${CSS.escape(monthVal)}"]`,
                  )
                : null;

              if (!existingMonth) {
                const imported = document.importNode(incMonth, true);
                existingMonths?.appendChild(imported);
                appended.push(
                  ...Array.from(
                    imported.querySelectorAll<HTMLElement>(".archive-post-item"),
                  ),
                );
                return;
              }

              const targetList =
                existingMonth.querySelector<HTMLElement>(".archive-posts");
              incMonth
                .querySelectorAll<HTMLElement>(".archive-post-item")
                .forEach((item) => {
                  const imported = document.importNode(item, true);
                  targetList?.appendChild(imported);
                  appended.push(imported);
                });
            });
        });

        applyFilter();

        if (appended.length && motionAllowed()) {
          gsap.fromTo(
            appended.slice(0, 12),
            { opacity: 0, y: 6 },
            {
              opacity: 1,
              y: 0,
              duration: 0.24,
              stagger: 0.02,
              ease: settleEase,
              clearProps: "transform,opacity",
            },
          );
        }

        const nextLoader = doc.querySelector<HTMLElement>(
          "[data-archive-loader]",
        );
        const newNextUrl = nextLoader?.dataset.nextUrl?.trim() ?? "";
        if (newNextUrl) {
          loader.dataset.nextUrl = newNextUrl;
          const p = nextLoader?.dataset.page ?? "";
          const tp = nextLoader?.dataset.totalPages ?? "";
          if (loadMeta && p && tp) loadMeta.textContent = `${p} / ${tp}`;
          if (loadLabel) loadLabel.textContent = "加载更早文章";
          loadBtn.disabled = false;
        } else {
          loader.dataset.nextUrl = "";
          observer?.disconnect();
          loader.innerHTML =
            '<p class="archive-end-note">— 已展示全部归档文章 —</p>';
        }
      } catch {
        if (loadLabel) loadLabel.textContent = "加载失败，点击重试";
        loadBtn.disabled = false;
      } finally {
        loading = false;
      }
    };

    loadBtn.addEventListener("click", () => {
      void loadMore();
    });

    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => {
          if (
            entries.some((e) => e.isIntersecting) &&
            !(filterInput?.value ?? "").trim()
          ) {
            void loadMore();
          }
        },
        { rootMargin: "220px 0px" },
      );
      observer.observe(loader);
    }
  }

  return () => {
    observer?.disconnect();
  };
}
