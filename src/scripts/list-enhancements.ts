/**
 * Shared progressive enhancements for inner list pages:
 * - Instant client-side filter for Categories & Tags (`[data-quick-filter]`)
 * - Seamless IntersectionObserver + button lazy load-more for PostList & Moments (`[data-list-loader]`)
 */
import { gsap, settleEase } from "./animation/engine";
import { motionAllowed } from "./motion";
import { syncUpvotedButtons } from "./upvote";

export function initListEnhancements(): () => void {
  const cleanups: Array<() => void> = [];

  /* 1. Instant Quick Filter (Categories / Tags) */
  document
    .querySelectorAll<HTMLInputElement>("[data-quick-filter]")
    .forEach((input) => {
      const key = input.dataset.quickFilter ?? "";
      const list = document.querySelector<HTMLElement>(
        `[data-quick-list="${CSS.escape(key)}"]`,
      );
      if (!list) return;

      const wrap = input.closest<HTMLElement>(".taxonomy-search-wrap");
      const countEl = document.querySelector<HTMLElement>(
        `[data-quick-filter-count="${CSS.escape(key)}"]`,
      );
      const emptyEl = document.querySelector<HTMLElement>(
        `[data-quick-filter-empty="${CSS.escape(key)}"]`,
      );
      const items = Array.from(list.children).filter(
        (el): el is HTMLElement => el instanceof HTMLElement,
      );

      const apply = () => {
        const q = input.value.trim().toLowerCase();
        let visible = 0;
        items.forEach((item) => {
          const text = (
            item.dataset.filterText ??
            item.textContent ??
            ""
          ).toLowerCase();
          const match = !q || text.includes(q);
          item.hidden = !match;
          if (match) visible += 1;
        });

        if (emptyEl) emptyEl.hidden = !q || visible > 0;
        if (countEl && wrap) {
          if (q) {
            countEl.textContent = `${visible} 项`;
            countEl.hidden = false;
            wrap.classList.add("has-count");
          } else {
            countEl.hidden = true;
            wrap.classList.remove("has-count");
          }
        }
      };

      input.addEventListener("input", apply);
    });

  /* 2. Seamless Lazy Load-More (Category/Tag PostList & Moments) */
  document
    .querySelectorAll<HTMLElement>("[data-list-root]")
    .forEach((root) => {
      const itemsWrap = root.querySelector<HTMLElement>("[data-list-items]");
      const loader = root.querySelector<HTMLElement>("[data-list-loader]");
      const loadBtn = loader?.querySelector<HTMLButtonElement>(
        "[data-list-load-btn]",
      );
      const loadLabel = loader?.querySelector<HTMLElement>(
        "[data-list-load-label]",
      );
      const loadMeta = loader?.querySelector<HTMLElement>(
        "[data-list-load-meta]",
      );
      const fallback = root.querySelector<HTMLElement>(
        "[data-list-pagination]",
      );
      if (!itemsWrap || !loader || !loadBtn) return;

      if (fallback) fallback.hidden = true;

      const defaultBtnLabel = loadLabel?.textContent ?? "加载更多";
      let loading = false;
      let observer: IntersectionObserver | null = null;

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
          const incoming = Array.from(
            doc.querySelectorAll<HTMLElement>("[data-list-items] > *"),
          );

          const appended: HTMLElement[] = [];
          incoming.forEach((node) => {
            const imported = document.importNode(node, true);
            itemsWrap.appendChild(imported);
            appended.push(imported);
          });
          syncUpvotedButtons(itemsWrap);

          if (appended.length && motionAllowed()) {
            gsap.fromTo(
              appended.slice(0, 10),
              { opacity: 0, y: 8 },
              {
                opacity: 1,
                y: 0,
                duration: 0.26,
                stagger: 0.025,
                ease: settleEase,
                clearProps: "transform,opacity",
              },
            );
          }

          const nextLoader = doc.querySelector<HTMLElement>(
            "[data-list-loader]",
          );
          const newNextUrl = nextLoader?.dataset.nextUrl?.trim() ?? "";
          if (newNextUrl) {
            loader.dataset.nextUrl = newNextUrl;
            const p = nextLoader?.dataset.page ?? "";
            const tp = nextLoader?.dataset.totalPages ?? "";
            if (loadMeta && p && tp) loadMeta.textContent = `${p} / ${tp}`;
            if (loadLabel) loadLabel.textContent = defaultBtnLabel;
            loadBtn.disabled = false;
          } else {
            loader.dataset.nextUrl = "";
            observer?.disconnect();
            loader.innerHTML =
              '<p class="list-end-note">— 已展示全部内容 —</p>';
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
            if (entries.some((e) => e.isIntersecting)) void loadMore();
          },
          { rootMargin: "220px 0px" },
        );
        observer.observe(loader);
        cleanups.push(() => observer?.disconnect());
      }
    });

  return () => {
    cleanups.forEach((fn) => fn());
  };
}
