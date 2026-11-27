/**
 * Long-article reading progress bookmark & calm resume pill:
 * - Saves scroll position in localStorage for genuinely long posts (LRU max 30, 30-day TTL)
 * - Auto-clears once the reader finishes (>= 93%) so finished articles never nag
 * - On revisit (with no URL hash), offers a quiet bottom frosted pill to jump back
 */
import { motionAllowed } from "./motion";

const STORAGE_KEY = "mote-reading-progress-v1";
const MAX_ENTRIES = 30;
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_DOC_SCROLL = 1000;
const MIN_ARTICLE_HEIGHT = 860;

interface ReadingEntry {
  y: number;
  pct: number;
  updatedAt: number;
}

type ReadingStore = Record<string, ReadingEntry>;

function normalizePath(raw: string): string {
  return raw.replace(/\/+$/, "") || "/";
}

function readStore(): ReadingStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ReadingStore;
    if (!parsed || typeof parsed !== "object") return {};
    const now = Date.now();
    const cleaned: ReadingStore = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (
        v &&
        typeof v.y === "number" &&
        typeof v.pct === "number" &&
        typeof v.updatedAt === "number" &&
        now - v.updatedAt < TTL_MS
      ) {
        cleaned[k] = v;
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

function writeStore(store: ReadingStore) {
  try {
    const entries = Object.entries(store)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(0, MAX_ENTRIES);
    const trimmed: ReadingStore = {};
    for (const [k, v] of entries) trimmed[k] = v;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* Storage is optional. */
  }
}

function computeReadingMetrics(article: HTMLElement): {
  y: number;
  pct: number;
  docMax: number;
} {
  const y = Math.max(0, Math.round(window.scrollY));
  const docMax = Math.max(
    0,
    document.documentElement.scrollHeight - window.innerHeight,
  );
  if (docMax <= 0) return { y, pct: 0, docMax };
  const rect = article.getBoundingClientRect();
  const articleEndY = y + rect.bottom;
  const readingTarget = Math.min(
    docMax,
    Math.max(1, articleEndY - window.innerHeight * 0.55),
  );
  const p = y >= docMax - 4 ? 1 : Math.min(Math.max(y / readingTarget, 0), 1);
  return { y, pct: Math.round(p * 100), docMax };
}

export function initReadingResume(): () => void {
  if (document.body.dataset.page !== "post") return () => {};
  const article = document.querySelector<HTMLElement>("[data-article-body]");
  if (!article) return () => {};

  const path = normalizePath(location.pathname);
  const controller = new AbortController();
  const { signal } = controller;

  let saveTimer: number | null = null;
  let showTimer: number | null = null;
  let autoHideTimer: number | null = null;
  let pill: HTMLElement | null = null;

  const removePill = () => {
    if (autoHideTimer !== null) {
      window.clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }
    if (!pill) return;
    const node = pill;
    pill = null;
    node.classList.remove("is-shown");
    window.setTimeout(() => node.remove(), 220);
  };

  const clearEntry = () => {
    const store = readStore();
    if (path in store) {
      delete store[path];
      writeStore(store);
    }
  };

  const saveNow = () => {
    if (!article.isConnected) return;
    const { y, pct, docMax } = computeReadingMetrics(article);
    if (docMax < MIN_DOC_SCROLL || article.offsetHeight < MIN_ARTICLE_HEIGHT) {
      return;
    }
    if (pct >= 93) {
      clearEntry();
      return;
    }
    if (pct >= 12 && y >= 300) {
      const store = readStore();
      store[path] = { y, pct, updatedAt: Date.now() };
      writeStore(store);
    }
  };

  const scheduleSave = () => {
    if (pill && window.scrollY > 260) {
      removePill();
    }
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      saveNow();
    }, 450);
  };

  window.addEventListener("scroll", scheduleSave, { passive: true, signal });
  window.addEventListener("pagehide", saveNow, { signal });

  // Check if we have a saved reading checkpoint to offer
  const saved = readStore()[path];
  if (
    saved &&
    saved.pct >= 12 &&
    saved.pct <= 92 &&
    saved.y >= 300 &&
    !location.hash &&
    window.scrollY < 160
  ) {
    showTimer = window.setTimeout(() => {
      showTimer = null;
      if (signal.aborted || !article.isConnected || window.scrollY >= 160) {
        return;
      }
      const { docMax } = computeReadingMetrics(article);
      if (docMax < MIN_DOC_SCROLL || article.offsetHeight < MIN_ARTICLE_HEIGHT) {
        return;
      }

      const targetY = Math.min(saved.y, docMax);
      if (targetY < 260) return;

      const el = document.createElement("aside");
      el.className = "reading-resume-pill";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      el.innerHTML = `
        <span class="resume-pill-icon" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M7 4h10v17l-5-4-5 4V4Z"></path>
          </svg>
        </span>
        <span class="resume-pill-text">上次读到 <strong class="num">${saved.pct}%</strong></span>
        <button type="button" class="resume-pill-go" data-resume-go>继续阅读</button>
        <button type="button" class="resume-pill-close" data-resume-close aria-label="忽略并清除断点">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
            <path d="M6 6l12 12M18 6 6 18"></path>
          </svg>
        </button>
      `;

      el.querySelector<HTMLButtonElement>("[data-resume-go]")?.addEventListener(
        "click",
        () => {
          removePill();
          window.scrollTo({
            top: targetY,
            behavior: motionAllowed() ? "smooth" : "auto",
          });
        },
        { signal },
      );

      el.querySelector<HTMLButtonElement>(
        "[data-resume-close]",
      )?.addEventListener(
        "click",
        () => {
          clearEntry();
          removePill();
        },
        { signal },
      );

      const scheduleAutoHide = (ms = 15_000) => {
        if (autoHideTimer !== null) window.clearTimeout(autoHideTimer);
        autoHideTimer = window.setTimeout(removePill, ms);
      };

      el.addEventListener(
        "mouseenter",
        () => {
          if (autoHideTimer !== null) {
            window.clearTimeout(autoHideTimer);
            autoHideTimer = null;
          }
        },
        { signal },
      );
      el.addEventListener("mouseleave", () => scheduleAutoHide(8_000), {
        signal,
      });

      document.body.append(el);
      pill = el;
      requestAnimationFrame(() => el.classList.add("is-shown"));
      scheduleAutoHide(15_000);
    }, 300);
  }

  return () => {
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (showTimer !== null) {
      window.clearTimeout(showTimer);
      showTimer = null;
    }
    saveNow();
    removePill();
    controller.abort();
  };
}
