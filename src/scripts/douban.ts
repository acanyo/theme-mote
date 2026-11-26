/**
 * Client-side controller for /douban (chengzhongxue/plugin-douban).
 * Uses the plugin's public JSON endpoint so styling, dark mode, and Swup
 * stay 100% aligned with Mote Minimal Plus.
 */

interface DoubanItem {
  id?: string;
  name?: string;
  poster?: string;
  link?: string;
  score?: string;
  year?: string;
  type?: string;
  pubdate?: string;
  cardSubtitle?: string;
  genres?: string[];
  favesRemark?: string;
  favesCreateTime?: string;
  favesScore?: string;
  favesStatus?: string;
}

interface DoubanListResponse {
  items?: DoubanItem[];
  hasNext?: boolean;
  page?: number;
  total?: number;
}

interface DoubanTypeItem {
  key: string;
  name?: string;
  doubanCount?: number;
}

const API_BASE = "/apis/api.douban.moony.la/v1alpha1/doubanmovies";
const PAGE_SIZE = 20;

const TYPE_LABELS: Record<string, string> = {
  movie: "电影",
  book: "图书",
  music: "音乐",
  game: "游戏",
  drama: "舞台剧",
};

const STATUS_LABELS: Record<string, [string, string, string]> = {
  movie: ["看过", "在看", "想看"],
  book: ["读过", "在读", "想读"],
  music: ["听过", "在听", "想听"],
  game: ["玩过", "在玩", "想玩"],
  drama: ["看过", "在看", "想看"],
};

function formatDate(raw?: string): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function renderStars(scoreStr?: string): string {
  const n = Number(scoreStr);
  if (!Number.isFinite(n) || n <= 0) return "";
  const stars = n > 5 ? Math.round(n / 2) : Math.round(n);
  const clamped = Math.min(5, Math.max(1, stars));
  return "★".repeat(clamped) + "☆".repeat(5 - clamped);
}

function createCard(item: DoubanItem, activeType: string): HTMLElement {
  const card = document.createElement("article");
  card.className = "db-card";
  card.dataset.type = item.type || activeType;

  const posterLink = document.createElement("a");
  posterLink.className = "db-poster-link";
  posterLink.href = item.link || "#";
  posterLink.target = "_blank";
  posterLink.rel = "noopener noreferrer";

  const img = document.createElement("img");
  img.src = item.poster || "";
  img.alt = item.name || "";
  img.loading = "lazy";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  posterLink.append(img);

  if (item.score && item.score !== "0") {
    const badge = document.createElement("span");
    badge.className = "db-score-badge num";
    badge.textContent = item.score;
    posterLink.append(badge);
  }
  card.append(posterLink);

  const title = document.createElement("h3");
  title.className = "db-card-title";
  const titleLink = document.createElement("a");
  titleLink.href = item.link || "#";
  titleLink.target = "_blank";
  titleLink.rel = "noopener noreferrer";
  titleLink.textContent = item.name || "未命名";
  title.append(titleLink);
  card.append(title);

  const meta = document.createElement("div");
  meta.className = "db-card-meta";
  const stars = renderStars(item.favesScore);
  if (stars) {
    const starEl = document.createElement("span");
    starEl.className = "db-card-stars";
    starEl.textContent = stars;
    meta.append(starEl);
  }
  const dateLabel = formatDate(item.favesCreateTime) || item.year || "";
  if (dateLabel) {
    const dateEl = document.createElement("span");
    dateEl.className = "num";
    dateEl.textContent = dateLabel;
    meta.append(dateEl);
  }
  if (meta.childElementCount > 0) card.append(meta);

  if (item.favesRemark && item.favesRemark.trim()) {
    const remark = document.createElement("p");
    remark.className = "db-card-remark";
    remark.textContent = item.favesRemark.trim();
    remark.title = item.favesRemark.trim();
    card.append(remark);
  }

  return card;
}

export function initDouban(): () => void {
  const root = document.querySelector<HTMLElement>("[data-douban-root]");
  if (!root) return () => {};

  const typesNav = root.querySelector<HTMLElement>("[data-db-types]");
  const statusWrap = root.querySelector<HTMLElement>("[data-db-statuses]");
  const genresWrap = root.querySelector<HTMLElement>("[data-db-genres]");
  const grid = root.querySelector<HTMLElement>("[data-db-grid]");
  const emptyEl = root.querySelector<HTMLElement>("[data-db-empty]");
  const moreWrap = root.querySelector<HTMLElement>("[data-db-more-wrap]");
  const moreBtn = root.querySelector<HTMLButtonElement>("[data-db-more]");

  if (!grid || !typesNav || !statusWrap) return () => {};

  const controller = new AbortController();
  let activeType =
    typesNav.querySelector<HTMLElement>(".db-type-tab.is-active")?.dataset
      .dbType ||
    typesNav.querySelector<HTMLElement>(".db-type-tab")?.dataset.dbType ||
    "movie";
  let activeStatus = "done";
  let activeGenre = "";
  let page = 1;
  let loading = false;
  let requestSeq = 0;

  const updateStatusCopy = () => {
    const labels = STATUS_LABELS[activeType] ?? STATUS_LABELS.movie;
    const btns = statusWrap.querySelectorAll<HTMLButtonElement>("[data-db-status]");
    btns.forEach((btn) => {
      const s = btn.dataset.dbStatus;
      if (s === "done") btn.textContent = labels[0];
      else if (s === "doing") btn.textContent = labels[1];
      else if (s === "mark") btn.textContent = labels[2];
    });
  };

  const renderSkeletons = () => {
    grid.innerHTML = "";
    for (let i = 0; i < 8; i++) {
      const sk = document.createElement("div");
      sk.className = "db-skeleton";
      sk.setAttribute("aria-hidden", "true");
      grid.append(sk);
    }
  };

  const loadGenres = async () => {
    if (!genresWrap) return;
    try {
      const res = await fetch(
        `${API_BASE}/-/genres?type=${encodeURIComponent(activeType)}`,
        { signal: controller.signal },
      );
      if (!res.ok) {
        genresWrap.hidden = true;
        return;
      }
      const list = (await res.json()) as string[];
      if (!Array.isArray(list) || list.length === 0) {
        genresWrap.hidden = true;
        return;
      }
      genresWrap.innerHTML = "";
      const allBtn = document.createElement("button");
      allBtn.type = "button";
      allBtn.className = `db-genre-chip${activeGenre === "" ? " is-active" : ""}`;
      allBtn.dataset.dbGenre = "";
      allBtn.textContent = "全部题材";
      genresWrap.append(allBtn);

      list.slice(0, 18).forEach((g) => {
        if (!g || !g.trim()) return;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `db-genre-chip${activeGenre === g ? " is-active" : ""}`;
        btn.dataset.dbGenre = g;
        btn.textContent = g;
        genresWrap.append(btn);
      });
      genresWrap.hidden = false;
    } catch {
      /* Ignore abort or network failure. */
    }
  };

  const loadItems = async (reset: boolean) => {
    if (loading && !reset) return;
    loading = true;
    const seq = ++requestSeq;

    if (reset) {
      page = 1;
      if (emptyEl) emptyEl.hidden = true;
      if (moreWrap) moreWrap.hidden = true;
      renderSkeletons();
    } else if (moreBtn) {
      moreBtn.disabled = true;
      moreBtn.textContent = "加载中…";
    }

    const params = new URLSearchParams({
      page: String(page),
      size: String(PAGE_SIZE),
      type: activeType,
      status: activeStatus,
    });
    if (activeGenre) params.set("genre", activeGenre);

    try {
      const res = await fetch(`${API_BASE}?${params.toString()}`, {
        signal: controller.signal,
      });
      if (seq !== requestSeq) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as DoubanListResponse;
      const items = Array.isArray(data.items) ? data.items : [];

      if (reset) grid.innerHTML = "";
      const frag = document.createDocumentFragment();
      items.forEach((item) => frag.append(createCard(item, activeType)));
      grid.append(frag);

      if (emptyEl) {
        emptyEl.hidden = grid.childElementCount > 0;
      }
      if (moreWrap && moreBtn) {
        moreWrap.hidden = !data.hasNext;
        moreBtn.disabled = false;
        moreBtn.textContent = "加载更多";
      }
      if (data.hasNext) page += 1;
    } catch (err) {
      if ((err as Error)?.name === "AbortError" || seq !== requestSeq) return;
      if (reset) grid.innerHTML = "";
      if (emptyEl) {
        emptyEl.textContent = "暂时无法加载豆瓣记录，请稍后刷新重试。";
        emptyEl.hidden = false;
      }
      if (moreWrap) moreWrap.hidden = true;
    } finally {
      if (seq === requestSeq) loading = false;
    }
  };

  // Fallback: if SSR had no types rendered, fetch them dynamically
  const ensureTypes = async () => {
    if (typesNav.querySelectorAll(".db-type-tab").length > 0) return;
    try {
      const res = await fetch(`${API_BASE}/-/types`, {
        signal: controller.signal,
      });
      if (!res.ok) return;
      const list = (await res.json()) as DoubanTypeItem[];
      if (!Array.isArray(list) || list.length === 0) return;
      activeType = list.find((t) => t.key === "movie")?.key ?? list[0].key;
      list.forEach((t) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `db-type-tab${t.key === activeType ? " is-active" : ""}`;
        btn.dataset.dbType = t.key;
        const nameSpan = document.createElement("span");
        nameSpan.className = "db-type-name";
        nameSpan.textContent = TYPE_LABELS[t.key] ?? t.name ?? t.key;
        btn.append(nameSpan);
        if (t.doubanCount && t.doubanCount > 0) {
          const countSpan = document.createElement("span");
          countSpan.className = "db-type-count num";
          countSpan.textContent = String(t.doubanCount);
          btn.append(countSpan);
        }
        typesNav.append(btn);
      });
    } catch {
      /* Ignore abort. */
    }
  };

  typesNav.addEventListener(
    "click",
    (event) => {
      const btn = (event.target as Element).closest<HTMLButtonElement>(
        "[data-db-type]",
      );
      if (!btn) return;
      const next = btn.dataset.dbType;
      if (!next || next === activeType) return;
      activeType = next;
      activeGenre = "";
      typesNav
        .querySelectorAll<HTMLElement>("[data-db-type]")
        .forEach((el) => el.classList.toggle("is-active", el === btn));
      updateStatusCopy();
      void loadGenres();
      void loadItems(true);
    },
    { signal: controller.signal },
  );

  statusWrap.addEventListener(
    "click",
    (event) => {
      const btn = (event.target as Element).closest<HTMLButtonElement>(
        "[data-db-status]",
      );
      if (!btn) return;
      const next = btn.dataset.dbStatus;
      if (!next || next === activeStatus) return;
      activeStatus = next;
      statusWrap
        .querySelectorAll<HTMLElement>("[data-db-status]")
        .forEach((el) => {
          const active = el === btn;
          el.classList.toggle("is-active", active);
          el.setAttribute("aria-checked", String(active));
        });
      void loadItems(true);
    },
    { signal: controller.signal },
  );

  genresWrap?.addEventListener(
    "click",
    (event) => {
      const btn = (event.target as Element).closest<HTMLButtonElement>(
        "[data-db-genre]",
      );
      if (!btn) return;
      const next = btn.dataset.dbGenre ?? "";
      if (next === activeGenre) return;
      activeGenre = next;
      genresWrap
        .querySelectorAll<HTMLElement>("[data-db-genre]")
        .forEach((el) => el.classList.toggle("is-active", el === btn));
      void loadItems(true);
    },
    { signal: controller.signal },
  );

  moreBtn?.addEventListener(
    "click",
    () => {
      void loadItems(false);
    },
    { signal: controller.signal },
  );

  void ensureTypes().then(() => {
    if (controller.signal.aborted) return;
    updateStatusCopy();
    void loadGenres();
    void loadItems(true);
  });

  return () => {
    controller.abort();
  };
}
