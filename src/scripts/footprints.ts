/**
 * Local visitor footprints (reading history, likes, comments) and commenting-guest identity.
 * - Stored strictly in the visitor's browser localStorage (privacy-first, zero backend schema needed)
 * - Detects guest commenter profiles from Halo comment widgets' localStorage AND passive POST observation
 * - Powers both the Header guest avatar/popover and the Footprints sheet
 */
import { createOverlay, type Overlay } from "./overlay";
import { openRandomPost } from "./actions";
import { toast } from "./toast";

export const FOOTPRINTS_EVENT = "mote:footprints-change";
export const GUEST_PROFILE_EVENT = "mote:guest-profile-change";
export const OPEN_FOOTPRINTS_EVENT = "mote:open-footprints";

const FOOTPRINTS_KEY = "mote-footprints-v1";
const GUEST_KEY = "mote-guest-profile";
const KNOWN_COMMENT_STORAGE_KEYS = [
  "halo-comment-custom-account",
  "comment-widget-custom-account",
  "halo-comment-account",
  "comment-next-account",
];

const MAX_VISITS = 40;
const MAX_COMMENTS = 30;
const MAX_LIKES = 40;

export interface GuestProfile {
  displayName: string;
  email?: string;
  website?: string;
  avatar?: string;
  updatedAt: number;
}

export interface VisitFootprint {
  path: string;
  title: string;
  kind: string;
  visitedAt: number;
  count: number;
}

export interface CommentFootprint {
  id: string;
  path: string;
  title: string;
  snippet: string;
  createdAt: number;
}

export interface LikeFootprint {
  key: string;
  path: string;
  title: string;
  kind: string;
  likedAt: number;
}

export interface FootprintsStore {
  visits: VisitFootprint[];
  comments: CommentFootprint[];
  likes: LikeFootprint[];
}

export interface AccountBadgeInfo {
  mode: "account" | "guest" | "anonymous";
  displayName: string;
  sub: string;
  avatar?: string;
}

let currentAccountBadge: AccountBadgeInfo = {
  mode: "anonymous",
  displayName: "访客",
  sub: "足迹仅保存在当前浏览器",
};

let fetchHookInstalled = false;

function safeReadJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function safeWriteJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage optional */
  }
}

function normalizePath(rawPath: string): string {
  try {
    const u = new URL(rawPath, location.origin);
    return u.pathname.replace(/\/+$/, "") || "/";
  } catch {
    return rawPath.replace(/\/+$/, "") || "/";
  }
}

function cleanPageTitle(): string {
  const h1 =
    document.querySelector<HTMLElement>(
      "#main .article-title, #main .page-title, #main .guestbook-title, #main h1",
    )?.textContent?.trim() ?? "";
  if (h1) return h1;
  const raw = document.title.trim();
  const cleaned = raw.replace(/\s+[-|]\s+[^-|]+$/, "").trim();
  return cleaned || raw || location.pathname;
}

function resolvePageKind(): string | null {
  const page = document.body.dataset.page ?? "";
  switch (page) {
    case "post":
      return "文章";
    case "single":
      return "页面";
    case "moment":
      return "瞬间";
    case "moments":
      return "瞬间";
    case "portfolio-detail":
      return "项目";
    case "portfolio":
      return "项目集";
    case "photos":
    case "photo":
      return "图库";
    case "links":
      return "友链";
    case "douban":
      return "书影音";
    case "equipments":
      return "装备";
    case "archives":
      return "归档";
    default:
      return null;
  }
}

export function readFootprints(): FootprintsStore {
  const parsed = safeReadJson<Partial<FootprintsStore>>(FOOTPRINTS_KEY);
  return {
    visits: Array.isArray(parsed?.visits) ? parsed.visits : [],
    comments: Array.isArray(parsed?.comments) ? parsed.comments : [],
    likes: Array.isArray(parsed?.likes) ? parsed.likes : [],
  };
}

function writeFootprints(store: FootprintsStore) {
  safeWriteJson(FOOTPRINTS_KEY, store);
  document.dispatchEvent(new CustomEvent(FOOTPRINTS_EVENT, { detail: store }));
}

export function getFootprintTotal(store: FootprintsStore = readFootprints()): number {
  return store.visits.length + store.comments.length + store.likes.length;
}

export function recordCurrentVisit() {
  const kind = resolvePageKind();
  if (!kind) return;
  const path = normalizePath(location.pathname);
  if (path === "/") return;
  const title = cleanPageTitle();
  const store = readFootprints();
  const now = Date.now();
  const existingIdx = store.visits.findIndex((item) => item.path === path);
  let count = 1;
  if (existingIdx >= 0) {
    const prev = store.visits[existingIdx];
    count = (prev.count || 1) + (now - prev.visitedAt > 15_000 ? 1 : 0);
    store.visits.splice(existingIdx, 1);
  }
  store.visits.unshift({ path, title, kind, visitedAt: now, count });
  store.visits = store.visits.slice(0, MAX_VISITS);
  writeFootprints(store);
}

export function recordLikeFootprint(input: {
  key: string;
  path: string;
  title: string;
  kind: string;
}) {
  const store = readFootprints();
  const path = normalizePath(input.path);
  store.likes = store.likes.filter((item) => item.key !== input.key);
  store.likes.unshift({
    key: input.key,
    path,
    title: input.title.trim() || path,
    kind: input.kind,
    likedAt: Date.now(),
  });
  store.likes = store.likes.slice(0, MAX_LIKES);
  writeFootprints(store);
}

export function recordCommentFootprint(input: {
  path?: string;
  title?: string;
  snippet: string;
}) {
  const snippet = input.snippet
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
  if (!snippet) return;
  const store = readFootprints();
  const now = Date.now();
  const path = normalizePath(input.path || location.pathname);
  const title = (input.title || cleanPageTitle()).trim() || path;
  store.comments.unshift({
    id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
    path,
    title,
    snippet,
    createdAt: now,
  });
  store.comments = store.comments.slice(0, MAX_COMMENTS);
  writeFootprints(store);
}

export function clearFootprints() {
  writeFootprints({ visits: [], comments: [], likes: [] });
}

function parseExternalGuestAccount(): GuestProfile | null {
  for (const key of KNOWN_COMMENT_STORAGE_KEYS) {
    const parsed = safeReadJson<Record<string, unknown>>(key);
    if (!parsed || typeof parsed !== "object") continue;
    const displayName = String(
      parsed.displayName ?? parsed.name ?? parsed.nick ?? parsed.author ?? "",
    ).trim();
    const email = String(parsed.email ?? "").trim();
    const website = String(parsed.website ?? parsed.url ?? "").trim();
    const avatar = String(parsed.avatar ?? "").trim();
    if (displayName || email) {
      return {
        displayName: displayName || email.split("@")[0] || "访客",
        email: email || undefined,
        website: website || undefined,
        avatar: avatar || undefined,
        updatedAt: Date.now(),
      };
    }
  }
  return null;
}

export function getGuestProfile(): GuestProfile | null {
  const stored = safeReadJson<GuestProfile>(GUEST_KEY);
  if (stored && (stored.displayName || stored.email)) {
    return stored;
  }
  const external = parseExternalGuestAccount();
  if (external) {
    safeWriteJson(GUEST_KEY, external);
    return external;
  }
  return null;
}

export function saveGuestProfile(
  patch: Partial<GuestProfile> & { displayName?: string },
): GuestProfile | null {
  const prev = getGuestProfile();
  const displayName = (
    patch.displayName?.trim() ||
    prev?.displayName ||
    patch.email?.trim().split("@")[0] ||
    ""
  ).trim();
  if (!displayName) return prev;
  const next: GuestProfile = {
    displayName,
    email: patch.email?.trim() || prev?.email || undefined,
    website: patch.website?.trim() || prev?.website || undefined,
    avatar: patch.avatar?.trim() || prev?.avatar || undefined,
    updatedAt: Date.now(),
  };
  safeWriteJson(GUEST_KEY, next);
  document.dispatchEvent(new CustomEvent(GUEST_PROFILE_EVENT, { detail: next }));
  return next;
}

export function clearGuestProfile() {
  try {
    localStorage.removeItem(GUEST_KEY);
    for (const key of KNOWN_COMMENT_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    /* Storage optional */
  }
  document.dispatchEvent(new CustomEvent(GUEST_PROFILE_EVENT, { detail: null }));
}

export async function gravatarSha256Url(email?: string): Promise<string> {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized || !crypto?.subtle) return "";
  try {
    const data = new TextEncoder().encode(normalized);
    const hashBuf = await crypto.subtle.digest("SHA-256", data);
    const hex = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `https://gravatar.com/avatar/${hex}?s=80&d=404`;
  } catch {
    return "";
  }
}

function isHaloCommentPost(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = (
    init?.method ??
    (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  if (method !== "POST") return false;
  const rawUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  try {
    const url = new URL(rawUrl, location.origin);
    if (url.origin !== location.origin) return false;
    return /\/apis\/api\.halo\.run\/v1alpha1\/comments(\/[^/]+\/reply)?$/i.test(
      url.pathname,
    );
  } catch {
    return false;
  }
}

function extractBodyJson(
  input: RequestInfo | URL,
  init?: RequestInit,
): Record<string, unknown> | null {
  const body = init?.body;
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (input instanceof Request) {
    /* Avoid consuming request stream synchronously */
    return null;
  }
  return null;
}

function pickNestedString(
  obj: Record<string, unknown> | null | undefined,
  paths: string[][],
): string {
  if (!obj) return "";
  for (const path of paths) {
    let cur: unknown = obj;
    for (const seg of path) {
      if (cur && typeof cur === "object" && seg in cur) {
        cur = (cur as Record<string, unknown>)[seg];
      } else {
        cur = undefined;
        break;
      }
    }
    if (typeof cur === "string" && cur.trim()) return cur.trim();
  }
  return "";
}

export function installCommentObserver() {
  if (fetchHookInstalled || typeof window.fetch !== "function") return;
  fetchHookInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const isComment = isHaloCommentPost(input, init);
    let reqJson: Record<string, unknown> | null = null;
    if (isComment) {
      reqJson = extractBodyJson(input, init);
      if (!reqJson && input instanceof Request) {
        try {
          reqJson = (await input.clone().json()) as Record<string, unknown>;
        } catch {
          reqJson = null;
        }
      }
    }
    const response = await nativeFetch(input, init);

    if (isComment && response.ok) {
      void response
        .clone()
        .json()
        .catch(() => null)
        .then((resJson: Record<string, unknown> | null) => {
          const snippet =
            pickNestedString(reqJson, [["raw"], ["content"], ["spec", "raw"], ["spec", "content"]]) ||
            pickNestedString(resJson, [["spec", "raw"], ["spec", "content"], ["raw"], ["content"]]);

          if (snippet) {
            recordCommentFootprint({ snippet });
          }

          const external = parseExternalGuestAccount();
          const displayName =
            pickNestedString(reqJson, [
              ["owner", "displayName"],
              ["spec", "owner", "displayName"],
              ["author"],
            ]) ||
            pickNestedString(resJson, [
              ["owner", "displayName"],
              ["spec", "owner", "displayName"],
            ]) ||
            external?.displayName ||
            "";
          const email =
            pickNestedString(reqJson, [
              ["owner", "email"],
              ["spec", "owner", "email"],
              ["email"],
            ]) ||
            pickNestedString(resJson, [
              ["owner", "email"],
              ["spec", "owner", "email"],
            ]) ||
            external?.email ||
            "";
          const website =
            pickNestedString(reqJson, [
              ["owner", "website"],
              ["spec", "owner", "website"],
              ["website"],
            ]) ||
            pickNestedString(resJson, [
              ["owner", "website"],
              ["spec", "owner", "website"],
            ]) ||
            external?.website ||
            "";
          const avatar =
            pickNestedString(resJson, [
              ["owner", "avatar"],
              ["spec", "owner", "avatar"],
            ]) ||
            external?.avatar ||
            "";

          if (displayName || email) {
            saveGuestProfile({ displayName, email, website, avatar });
          }
        });
    }

    return response;
  };
}

export function setFootprintAccountInfo(info: AccountBadgeInfo) {
  currentAccountBadge = info;
  document.dispatchEvent(new CustomEvent("mote:footprint-identity-sync"));
}

function formatRelativeTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day === 1) return "昨天";
  if (day < 7) return `${day} 天前`;
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${m}-${dd}`;
}

type TabFilter = "all" | "visits" | "comments" | "likes";

interface TimelineRow {
  type: "visit" | "comment" | "like";
  path: string;
  title: string;
  meta: string;
  snippet?: string;
  time: number;
}

function buildRows(store: FootprintsStore, filter: TabFilter): TimelineRow[] {
  const rows: TimelineRow[] = [];
  if (filter === "all" || filter === "visits") {
    for (const v of store.visits) {
      rows.push({
        type: "visit",
        path: v.path,
        title: v.title,
        meta: v.count > 1 ? `${v.kind} · 读过 ${v.count} 次` : v.kind,
        time: v.visitedAt,
      });
    }
  }
  if (filter === "all" || filter === "comments") {
    for (const c of store.comments) {
      rows.push({
        type: "comment",
        path: c.path,
        title: c.title,
        meta: "发表了评论",
        snippet: c.snippet,
        time: c.createdAt,
      });
    }
  }
  if (filter === "all" || filter === "likes") {
    for (const l of store.likes) {
      rows.push({
        type: "like",
        path: l.path,
        title: l.title,
        meta: `喜欢了${l.kind}`,
        time: l.likedAt,
      });
    }
  }
  rows.sort((a, b) => b.time - a.time);
  return rows;
}

const ROW_ICON: Record<TimelineRow["type"], string> = {
  visit:
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 6C8 3 4 4 2 5v15c4-2 7-2 10 0m0-14c4-3 8-2 10-1v15c-4-2-7-2-10 0V6Z"/></svg>',
  comment:
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5h14v10H9l-4 4z"/></svg>',
  like:
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.4s-7-4.4-9.2-8.4C1.2 9.1 2.7 5.5 6.4 5.2c2-.2 3.7.9 4.6 2.3.9-1.4 2.6-2.5 4.6-2.3 3.7.3 5.2 3.9 3.6 6.8-2.2 4-7.2 8.4-7.2 8.4Z"/></svg>',
};

export function initFootprints(): Overlay | null {
  installCommentObserver();

  const root = document.querySelector<HTMLElement>("[data-footprints]");
  if (!root) return null;

  const overlay = createOverlay(root);
  const listEl = root.querySelector<HTMLElement>("[data-fp-list]");
  const emptyEl = root.querySelector<HTMLElement>("[data-fp-empty]");
  const clearBtn = root.querySelector<HTMLButtonElement>("[data-fp-clear]");
  const tabs = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-fp-tab]"),
  );
  const visitCountEl = root.querySelector<HTMLElement>("[data-fp-count='visits']");
  const commentCountEl = root.querySelector<HTMLElement>(
    "[data-fp-count='comments']",
  );
  const likeCountEl = root.querySelector<HTMLElement>("[data-fp-count='likes']");
  const avatarImg = root.querySelector<HTMLImageElement>("[data-fp-avatar]");
  const avatarInitial = root.querySelector<HTMLElement>("[data-fp-initial]");
  const nameEl = root.querySelector<HTMLElement>("[data-fp-name]");
  const roleEl = root.querySelector<HTMLElement>("[data-fp-role]");
  const subEl = root.querySelector<HTMLElement>("[data-fp-sub]");
  const loginLink = root.querySelector<HTMLAnchorElement>("[data-fp-login]");
  const randomBtn = root.querySelector<HTMLButtonElement>("[data-fp-random]");

  let activeTab: TabFilter = "all";

  const renderIdentity = () => {
    const info = currentAccountBadge;
    const initial = Array.from(info.displayName || "访")[0]?.toUpperCase() || "访";
    if (nameEl) nameEl.textContent = info.displayName;
    if (subEl) subEl.textContent = info.sub;
    if (roleEl) {
      roleEl.textContent =
        info.mode === "account"
          ? "已登录"
          : info.mode === "guest"
            ? "评论访客"
            : "访客";
      roleEl.dataset.mode = info.mode;
    }
    if (loginLink) {
      loginLink.hidden = info.mode === "account";
    }
    if (avatarImg && avatarInitial) {
      if (info.avatar) {
        avatarImg.alt = info.displayName;
        avatarImg.onerror = () => {
          avatarImg.hidden = true;
          avatarInitial.textContent = initial;
          avatarInitial.hidden = false;
        };
        avatarImg.src = info.avatar;
        avatarImg.hidden = false;
        avatarInitial.hidden = true;
      } else {
        avatarImg.hidden = true;
        avatarInitial.textContent = initial;
        avatarInitial.hidden = false;
      }
    }
  };

  const renderList = () => {
    const store = readFootprints();
    if (visitCountEl) visitCountEl.textContent = String(store.visits.length);
    if (commentCountEl)
      commentCountEl.textContent = String(store.comments.length);
    if (likeCountEl) likeCountEl.textContent = String(store.likes.length);
    if (clearBtn) clearBtn.hidden = getFootprintTotal(store) === 0;

    tabs.forEach((tab) => {
      const selected = tab.dataset.fpTab === activeTab;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
    });

    if (!listEl || !emptyEl) return;
    const rows = buildRows(store, activeTab);
    listEl.innerHTML = "";
    emptyEl.hidden = rows.length > 0;
    listEl.hidden = rows.length === 0;

    const frag = document.createDocumentFragment();
    for (const row of rows) {
      const li = document.createElement("li");
      li.className = `fp-item fp-item--${row.type}`;

      const link = document.createElement("a");
      link.className = "fp-row";
      link.href = row.path;
      link.addEventListener("click", () => overlay.close());

      const iconWrap = document.createElement("span");
      iconWrap.className = "fp-row-icon";
      iconWrap.innerHTML = ROW_ICON[row.type];

      const main = document.createElement("span");
      main.className = "fp-row-main";

      const top = document.createElement("span");
      top.className = "fp-row-top";

      const titleSpan = document.createElement("span");
      titleSpan.className = "fp-row-title";
      titleSpan.textContent = row.title;

      const timeSpan = document.createElement("span");
      timeSpan.className = "fp-row-time num";
      timeSpan.textContent = formatRelativeTime(row.time);

      top.append(titleSpan, timeSpan);
      main.append(top);

      if (row.snippet) {
        const quote = document.createElement("span");
        quote.className = "fp-row-snippet";
        quote.textContent = `「${row.snippet}」`;
        main.append(quote);
      } else {
        const meta = document.createElement("span");
        meta.className = "fp-row-meta";
        meta.textContent = row.meta;
        main.append(meta);
      }

      link.append(iconWrap, main);
      li.append(link);
      frag.append(li);
    }
    listEl.append(frag);
  };

  tabs.forEach((tab) =>
    tab.addEventListener("click", () => {
      const next = tab.dataset.fpTab as TabFilter | undefined;
      if (next) {
        activeTab = next;
        renderList();
      }
    }),
  );

  clearBtn?.addEventListener("click", () => {
    clearFootprints();
    toast("已清空本地足迹", "info");
  });

  randomBtn?.addEventListener("click", () => {
    overlay.close();
    if (!openRandomPost()) toast("还没有其他文章");
  });

  const openFootprints = (origin?: HTMLElement | null) => {
    renderIdentity();
    renderList();
    overlay.open(origin);
  };

  document.addEventListener(OPEN_FOOTPRINTS_EVENT, (event) => {
    const origin =
      event instanceof CustomEvent && event.detail instanceof HTMLElement
        ? event.detail
        : null;
    openFootprints(origin);
  });

  document.addEventListener(FOOTPRINTS_EVENT, () => {
    if (overlay.isOpen()) renderList();
  });

  document.addEventListener("mote:footprint-identity-sync", () => {
    if (overlay.isOpen()) renderIdentity();
  });

  return overlay;
}
