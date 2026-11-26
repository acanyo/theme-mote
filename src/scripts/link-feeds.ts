/**
 * Standalone Friends Circle (朋友圈 / page_friends.html) controller
 * for halo-sigs/plugin-links (v2.5+):
 * - Fetches GET /apis/api.link.halo.run/v1alpha1/linkfeeds
 * - Group filtering (groupName), single-friend filtering (linkName), and instant text filter
 * - Cursor-based infinite scroll + manual load-more fallback (beforePublishedAt / beforeId)
 * - Enriches feed authors & logos from SSR link directory metadata bridge
 */
import { gsap, settleEase } from "./animation/engine";
import { motionAllowed } from "./motion";
import { toast } from "./toast";

interface LinkFeedItem {
  id?: string;
  linkName?: string;
  title?: string;
  url?: string;
  summary?: string;
  author?: string;
  authorUrl?: string;
  authorLogo?: string;
  publishedAt?: string;
  fetchedAt?: string;
}

interface LinkFeedPage {
  items?: LinkFeedItem[];
  hasNext?: boolean;
  nextBeforePublishedAt?: string;
  nextBeforeId?: string;
}

interface LinkDirectoryMeta {
  displayName: string;
  logo: string;
  url: string;
}

const FEEDS_API = "/apis/api.link.halo.run/v1alpha1/linkfeeds";

function safeHttpUrl(raw?: string | null): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed, location.origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    return "";
  }
  return "";
}

function hostFromUrl(raw?: string | null): string {
  const safe = safeHttpUrl(raw);
  if (!safe) return "";
  try {
    return new URL(safe).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function stripSummary(raw?: string | null): string {
  if (!raw) return "";
  const text = raw.trim();
  if (!text) return "";
  try {
    const doc = new DOMParser().parseFromString(text, "text/html");
    return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
  } catch {
    return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatFeedDate(iso?: string): { label: string; full: string } {
  if (!iso) return { label: "", full: "" };
  const date = new Date(iso);
  const ts = date.getTime();
  if (Number.isNaN(ts)) return { label: "", full: "" };

  const full = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  const diffMs = Date.now() - ts;

  if (diffMs >= 0) {
    const mins = Math.floor(diffMs / 60000);
    if (mins < 5) return { label: "刚刚", full };
    if (mins < 60) return { label: `${mins} 分钟前`, full };
    const hours = Math.floor(mins / 60);
    if (hours < 24) return { label: `${hours} 小时前`, full };
    const days = Math.floor(hours / 24);
    if (days < 7) return { label: `${days} 天前`, full };
  }

  const nowYear = new Date().getFullYear();
  const label =
    date.getFullYear() === nowYear
      ? `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
      : `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  return { label, full };
}

function buildAvatarFallback(name: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "feed-avatar-char";
  span.setAttribute("aria-hidden", "true");
  span.textContent = (name.trim().charAt(0) || "友").toUpperCase();
  return span;
}

function buildExternalSvg(): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", "12");
  svg.setAttribute("height", "12");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("feed-item-ext");
  const p1 = document.createElementNS(ns, "path");
  p1.setAttribute("d", "M7 17 17 7");
  const p2 = document.createElementNS(ns, "path");
  p2.setAttribute("d", "M9 7h8v8");
  svg.append(p1, p2);
  return svg;
}

export function initLinkFeeds(): () => void {
  const root = document.querySelector<HTMLElement>("[data-friends-page]");
  const stream = root?.querySelector<HTMLElement>("[data-feed-stream]");
  if (!root || !stream) return () => {};

  const groupBtns = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-feed-group]"),
  );
  const searchInput = root.querySelector<HTMLInputElement>("[data-feed-search]");
  const activeFilterBar = root.querySelector<HTMLElement>(
    "[data-feed-active-filter]",
  );
  const activeFilterName = root.querySelector<HTMLElement>(
    "[data-feed-filter-name]",
  );
  const activeFilterClear = root.querySelector<HTMLButtonElement>(
    "[data-feed-filter-clear]",
  );

  const skeleton = root.querySelector<HTMLElement>("[data-feed-skeleton]");
  const emptyNote = root.querySelector<HTMLElement>("[data-feed-empty]");
  const searchEmptyNote = root.querySelector<HTMLElement>(
    "[data-feed-search-empty]",
  );
  const loader = root.querySelector<HTMLElement>("[data-feed-loader]");
  const loadBtn = root.querySelector<HTMLButtonElement>("[data-feed-load-btn]");
  const loadLabel = root.querySelector<HTMLElement>("[data-feed-load-label]");
  const endNote = root.querySelector<HTMLElement>("[data-feed-end-note]");

  const parsedSize = Number.parseInt(root.dataset.feedsPageSize ?? "15", 10);
  const pageSize = Number.isFinite(parsedSize)
    ? Math.min(50, Math.max(5, parsedSize))
    : 15;

  // Build friend metadata map from the SSR bridge
  const directoryMap = new Map<string, LinkDirectoryMeta>();
  root
    .querySelectorAll<HTMLElement>("[data-link-name]")
    .forEach((node) => {
      const name = (node.dataset.linkName ?? "").trim();
      if (!name) return;
      directoryMap.set(name, {
        displayName: (node.dataset.linkTitle ?? "").trim(),
        logo: (node.dataset.linkLogo ?? "").trim(),
        url: (node.dataset.linkUrl ?? "").trim(),
      });
    });

  const urlParams = new URLSearchParams(location.search);
  let currentGroup = (urlParams.get("group") ?? "").trim();
  let currentLinkName = (urlParams.get("link") ?? "").trim();
  let currentLinkLabel = currentLinkName
    ? (directoryMap.get(currentLinkName)?.displayName ?? currentLinkName)
    : "";

  let hasNext = false;
  let nextBeforePublishedAt = "";
  let nextBeforeId = "";
  let loading = false;
  let fetchSeq = 0;
  const seenIds = new Set<string>();

  const controller = new AbortController();
  const { signal } = controller;

  const setEmptyState = (msg: string | null) => {
    if (!emptyNote) return;
    if (!msg) {
      emptyNote.hidden = true;
      return;
    }
    emptyNote.textContent = msg;
    emptyNote.hidden = false;
  };

  const applySearchFilter = () => {
    const query = (searchInput?.value ?? "").trim().toLowerCase();
    const rows = Array.from(stream.querySelectorAll<HTMLElement>(".feed-item"));
    let visibleCount = 0;
    for (const row of rows) {
      const haystack = row.dataset.feedSearchText ?? "";
      const matched = !query || haystack.includes(query);
      row.hidden = !matched;
      if (matched) visibleCount += 1;
    }
    if (searchEmptyNote) {
      searchEmptyNote.hidden = !(query && rows.length > 0 && visibleCount === 0);
    }
  };

  const syncGroupTabs = () => {
    groupBtns.forEach((btn) => {
      const active =
        !currentLinkName && (btn.dataset.feedGroup ?? "") === currentGroup;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
  };

  const updateFriendFilterChip = () => {
    if (!activeFilterBar || !activeFilterName) return;
    if (currentLinkName) {
      activeFilterName.textContent = currentLinkLabel || currentLinkName;
      activeFilterBar.hidden = false;
    } else {
      activeFilterBar.hidden = true;
      activeFilterName.textContent = "";
    }
  };

  const syncLoaderUi = () => {
    if (!loader || !loadBtn || !loadLabel) return;
    const totalRendered = stream.children.length;
    if (hasNext) {
      loader.hidden = false;
      loadBtn.disabled = loading;
      loadLabel.textContent = loading ? "正在加载动态..." : "加载更早动态";
      if (endNote) endNote.hidden = true;
    } else {
      loader.hidden = true;
      if (endNote) {
        endNote.hidden = totalRendered === 0 || Boolean(searchInput?.value.trim());
      }
    }
  };

  const renderFeedRow = (item: LinkFeedItem): HTMLLIElement | null => {
    const title = (item.title ?? "").trim();
    const articleUrl = safeHttpUrl(item.url);
    if (!title || !articleUrl) return null;

    const linkName = (item.linkName ?? "").trim();
    const dirMeta = linkName ? directoryMap.get(linkName) : undefined;
    const authorLabel =
      dirMeta?.displayName ||
      (item.author ?? "").trim() ||
      hostFromUrl(item.authorUrl || dirMeta?.url || articleUrl) ||
      "友邻";
    const authorLogo =
      safeHttpUrl(item.authorLogo) || safeHttpUrl(dirMeta?.logo);
    const summaryText = stripSummary(item.summary);
    const dateInfo = formatFeedDate(item.publishedAt || item.fetchedAt);

    const li = document.createElement("li");
    li.className = "feed-item";
    li.dataset.feedSearchText = `${title} ${authorLabel} ${summaryText}`.toLowerCase();

    const meta = document.createElement("div");
    meta.className = "feed-item-meta";

    const authorBtn = document.createElement("button");
    authorBtn.type = "button";
    authorBtn.className = "feed-author-btn";
    if (linkName) {
      authorBtn.dataset.feedFilterLink = linkName;
      authorBtn.dataset.feedFilterLabel = authorLabel;
      authorBtn.dataset.tip = `只看 ${authorLabel} 的动态`;
    } else {
      authorBtn.disabled = true;
    }

    if (authorLogo) {
      const avatar = document.createElement("img");
      avatar.className = "feed-avatar";
      avatar.src = authorLogo;
      avatar.width = 20;
      avatar.height = 20;
      avatar.alt = "";
      avatar.loading = "lazy";
      avatar.decoding = "async";
      avatar.setAttribute("data-img-placeholder-ignore", "");
      avatar.addEventListener(
        "error",
        () => {
          avatar.replaceWith(buildAvatarFallback(authorLabel));
        },
        { once: true },
      );
      authorBtn.append(avatar);
    } else {
      authorBtn.append(buildAvatarFallback(authorLabel));
    }

    const authorName = document.createElement("span");
    authorName.className = "feed-author-name";
    authorName.textContent = authorLabel;
    authorBtn.append(authorName);
    meta.append(authorBtn);

    if (dateInfo.label) {
      const dot = document.createElement("span");
      dot.className = "feed-meta-sep";
      dot.setAttribute("aria-hidden", "true");
      dot.textContent = "·";

      const time = document.createElement("time");
      time.className = "feed-item-time num";
      if (item.publishedAt) time.dateTime = item.publishedAt;
      time.textContent = dateInfo.label;
      if (dateInfo.full) {
        time.dataset.tip = `发布于 ${dateInfo.full}`;
      }
      meta.append(dot, time);
    }

    const link = document.createElement("a");
    link.className = "feed-item-link";
    link.href = articleUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    const titleWrap = document.createElement("div");
    titleWrap.className = "feed-item-head";

    const titleEl = document.createElement("h3");
    titleEl.className = "feed-item-title";
    titleEl.textContent = title;
    titleWrap.append(titleEl, buildExternalSvg());
    link.append(titleWrap);

    if (summaryText) {
      const summaryEl = document.createElement("p");
      summaryEl.className = "feed-item-summary";
      summaryEl.textContent = summaryText;
      link.append(summaryEl);
    }

    li.append(meta, link);
    return li;
  };

  const fetchFeedPage = async (opts: {
    groupName?: string;
    linkName?: string;
    beforePublishedAt?: string;
    beforeId?: string;
  }): Promise<{ ok: boolean; data: LinkFeedPage | null }> => {
    const params = new URLSearchParams();
    params.set("limit", String(pageSize));
    if (opts.groupName) params.set("groupName", opts.groupName);
    if (opts.linkName) params.set("linkName", opts.linkName);
    if (opts.beforePublishedAt) {
      params.set("beforePublishedAt", opts.beforePublishedAt);
    }
    if (opts.beforeId) params.set("beforeId", opts.beforeId);

    try {
      const res = await fetch(`${FEEDS_API}?${params.toString()}`, {
        headers: { Accept: "application/json" },
        signal,
      });
      if (!res.ok) return { ok: false, data: null };
      const data = (await res.json()) as LinkFeedPage;
      return { ok: true, data };
    } catch {
      return { ok: false, data: null };
    }
  };

  const appendPageItems = (page: LinkFeedPage, animateEnter: boolean) => {
    const rawItems = Array.isArray(page.items) ? page.items : [];
    const added: HTMLElement[] = [];
    const frag = document.createDocumentFragment();

    for (const item of rawItems) {
      const dedupeKey = item.id || `${item.url ?? ""}|${item.publishedAt ?? ""}`;
      if (dedupeKey && seenIds.has(dedupeKey)) continue;
      if (dedupeKey) seenIds.add(dedupeKey);
      const row = renderFeedRow(item);
      if (row) {
        frag.append(row);
        added.push(row);
      }
    }

    stream.append(frag);

    hasNext = Boolean(
      page.hasNext && (page.nextBeforePublishedAt || page.nextBeforeId),
    );
    nextBeforePublishedAt = page.nextBeforePublishedAt ?? "";
    nextBeforeId = page.nextBeforeId ?? "";

    applySearchFilter();
    syncLoaderUi();

    if (animateEnter && added.length > 0 && motionAllowed()) {
      gsap.fromTo(
        added,
        { opacity: 0, y: 8 },
        {
          opacity: 1,
          y: 0,
          duration: 0.24,
          stagger: 0.024,
          ease: settleEase,
          clearProps: "transform",
        },
      );
    }
  };

  const loadFeeds = async (reset: boolean) => {
    if (loading && !reset) return;
    if (!reset && !hasNext) return;

    const mySeq = ++fetchSeq;
    loading = true;
    setEmptyState(null);
    if (searchEmptyNote) searchEmptyNote.hidden = true;

    if (reset) {
      seenIds.clear();
      stream.textContent = "";
      hasNext = false;
      nextBeforePublishedAt = "";
      nextBeforeId = "";
      if (endNote) endNote.hidden = true;
      if (loader) loader.hidden = true;
      if (skeleton) skeleton.hidden = false;
    } else {
      syncLoaderUi();
    }

    const res = await fetchFeedPage({
      groupName: currentGroup || undefined,
      linkName: currentLinkName || undefined,
      beforePublishedAt: reset ? undefined : nextBeforePublishedAt || undefined,
      beforeId: reset ? undefined : nextBeforeId || undefined,
    });

    if (signal.aborted || mySeq !== fetchSeq) return;
    loading = false;
    if (skeleton) skeleton.hidden = true;

    if (!res.ok || !res.data) {
      if (reset) {
        setEmptyState(
          "暂未开启公开订阅动态，请在 Halo 后台「链接管理 → RSS 订阅」中开启「公开 RSS 订阅动态」。",
        );
      } else {
        toast("加载更多动态失败，请稍后重试", "warn");
      }
      syncLoaderUi();
      return;
    }

    appendPageItems(res.data, true);
    if (stream.children.length === 0) {
      if (currentLinkName) {
        setEmptyState(
          `暂无「${currentLinkLabel || currentLinkName}」的近期订阅动态。`,
        );
      } else if (currentGroup) {
        setEmptyState("该分组下暂未抓取到友链订阅动态。");
      } else {
        setEmptyState(
          "暂未抓取到友链订阅动态，请先在链接管理中为友链配置 RSS 地址。",
        );
      }
    }
  };

  groupBtns.forEach((btn) => {
    btn.addEventListener(
      "click",
      () => {
        const nextGroup = btn.dataset.feedGroup ?? "";
        if (nextGroup === currentGroup && !currentLinkName) return;
        currentGroup = nextGroup;
        currentLinkName = "";
        currentLinkLabel = "";
        syncGroupTabs();
        updateFriendFilterChip();
        void loadFeeds(true);
      },
      { signal },
    );
  });

  stream.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const authorBtn = target.closest<HTMLButtonElement>(
        "[data-feed-filter-link]",
      );
      if (!authorBtn) return;
      const nextLink = authorBtn.dataset.feedFilterLink ?? "";
      const nextLabel = authorBtn.dataset.feedFilterLabel ?? "";
      if (!nextLink) return;

      if (currentLinkName === nextLink) {
        currentLinkName = "";
        currentLinkLabel = "";
      } else {
        currentLinkName = nextLink;
        currentLinkLabel = nextLabel;
        currentGroup = "";
      }
      syncGroupTabs();
      updateFriendFilterChip();
      void loadFeeds(true);
    },
    { signal },
  );

  activeFilterClear?.addEventListener(
    "click",
    () => {
      if (!currentLinkName) return;
      currentLinkName = "";
      currentLinkLabel = "";
      syncGroupTabs();
      updateFriendFilterChip();
      void loadFeeds(true);
    },
    { signal },
  );

  searchInput?.addEventListener("input", applySearchFilter, { signal });
  loadBtn?.addEventListener("click", () => void loadFeeds(false), { signal });

  let observer: IntersectionObserver | null = null;
  if (loader && "IntersectionObserver" in window) {
    observer = new IntersectionObserver(
      (entries) => {
        if (
          hasNext &&
          !loading &&
          !searchInput?.value.trim() &&
          entries.some((entry) => entry.isIntersecting)
        ) {
          void loadFeeds(false);
        }
      },
      { rootMargin: "260px 0px" },
    );
    observer.observe(loader);
  }

  syncGroupTabs();
  updateFriendFilterChip();
  void loadFeeds(true);

  return () => {
    controller.abort();
    observer?.disconnect();
  };
}
