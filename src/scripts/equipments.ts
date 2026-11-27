/**
 * Client-side controller for /equipments (chengzhongxue/plugin-equipment):
 * - Group tabs (WAI-ARIA tablist + URL ?group= sync + GSAP settle cascade)
 * - Instant keyword filter across name, specification, description, and group
 * - Grid / List studio view switcher persisted in localStorage
 * - Smart multi-token specification badge splitting
 * - Clean product hostname extraction & portrait image aspect-ratio protection
 */
import { gsap, settleEase } from "./animation/engine";
import { motionAllowed } from "./motion";

const VIEW_STORAGE_KEY = "mote-eq-view";
const SPEC_SPLIT_RE = /(?:\s*[|｜·•、，]\s*|\s+\/\s+|,\s+)/;

type EqViewMode = "grid" | "list";

function readSavedView(): EqViewMode {
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY);
    if (raw === "list" || raw === "grid") return raw;
  } catch {
    /* Storage is optional. */
  }
  return "grid";
}

function saveView(mode: EqViewMode) {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, mode);
  } catch {
    /* Storage is optional. */
  }
}

function parseHostname(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed, location.href);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function createSpecChip(text: string): HTMLButtonElement {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "eq-spec-badge";
  chip.dataset.eqSpecChip = text;
  chip.dataset.tip = `按「${text}」筛选`;
  chip.setAttribute("aria-pressed", "false");
  chip.textContent = text;
  return chip;
}

function enhanceSpecRows(root: HTMLElement) {
  root
    .querySelectorAll<HTMLElement>("[data-eq-specs]")
    .forEach((row) => {
      if (row.dataset.eqSpecsParsed === "true") return;
      row.dataset.eqSpecsParsed = "true";

      const badge = row.querySelector<HTMLElement>(".eq-spec-badge");
      if (!badge) return;
      const raw = (badge.textContent ?? "").trim();
      if (!raw) return;

      const splitParts = raw
        .split(SPEC_SPLIT_RE)
        .map((part) => part.trim())
        .filter(Boolean);

      const useSplit =
        splitParts.length >= 2 &&
        splitParts.length <= 6 &&
        splitParts.every((part) => part.length <= 36);

      const tokens = useSplit ? splitParts : [raw];
      const frag = document.createDocumentFragment();
      tokens.forEach((part) => frag.append(createSpecChip(part)));
      row.replaceChildren(frag);
    });
}

function enhanceDomains(root: HTMLElement) {
  root
    .querySelectorAll<HTMLElement>("[data-eq-domain]")
    .forEach((el) => {
      const host = parseHostname(el.dataset.eqUrl ?? "");
      if (!host) {
        el.hidden = true;
        return;
      }
      el.textContent = host;
      el.hidden = false;
    });
}

function enhancePortraitThumbs(root: HTMLElement, signal: AbortSignal) {
  const check = (img: HTMLImageElement) => {
    if (!img.naturalWidth || !img.naturalHeight) return;
    const frame = img.closest<HTMLElement>(".eq-thumb");
    if (!frame) return;
    const ratio = img.naturalHeight / img.naturalWidth;
    frame.classList.toggle("is-contain", ratio > 1.15);
  };

  root.querySelectorAll<HTMLImageElement>(".eq-thumb img").forEach((img) => {
    if (img.complete && img.naturalWidth > 0) {
      check(img);
    } else {
      img.addEventListener("load", () => check(img), { once: true, signal });
    }
  });
}

function syncUrlGroup(group: string) {
  try {
    const url = new URL(location.href);
    if (group === "all") {
      url.searchParams.delete("group");
    } else {
      url.searchParams.set("group", group);
    }
    history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* Ignore history errors. */
  }
}

export function initEquipments(): () => void {
  const root = document.querySelector<HTMLElement>("[data-eq-root]");
  if (!root) return () => {};

  const controller = new AbortController();
  const { signal } = controller;

  enhanceSpecRows(root);
  enhanceDomains(root);
  enhancePortraitThumbs(root, signal);

  const tabs = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-eq-filter]"),
  );
  const groups = Array.from(
    root.querySelectorAll<HTMLElement>("[data-eq-group]"),
  );
  const viewButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-eq-view-btn]"),
  );
  const searchWrap = root.querySelector<HTMLElement>("[data-eq-search-wrap]");
  const searchInput = root.querySelector<HTMLInputElement>("[data-eq-search-input]");
  const searchCount = root.querySelector<HTMLElement>("[data-eq-search-count]");
  const searchClear = root.querySelector<HTMLButtonElement>("[data-eq-search-clear]");
  const emptyFilter = root.querySelector<HTMLElement>("[data-eq-empty-filter]");
  const resetBtn = root.querySelector<HTMLButtonElement>("[data-eq-reset]");

  const animateCards = (cards: HTMLElement[]) => {
    if (!cards.length || !motionAllowed()) return;
    gsap.fromTo(
      cards.slice(0, 10),
      { opacity: 0, y: 7 },
      {
        opacity: 1,
        y: 0,
        duration: 0.24,
        stagger: 0.022,
        ease: settleEase,
        force3D: true,
        clearProps: "transform,opacity",
        overwrite: "auto",
      },
    );
  };

  /* 1. View Mode Switcher (Grid / List) */
  const applyView = (mode: EqViewMode, animate: boolean) => {
    root.dataset.eqView = mode;
    viewButtons.forEach((btn) => {
      const active = btn.dataset.eqViewBtn === mode;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
    if (animate) {
      const visibleCards = Array.from(
        root.querySelectorAll<HTMLElement>("[data-eq-card]:not([hidden])"),
      ).filter((card) => !card.closest("[data-eq-group][hidden]"));
      animateCards(visibleCards);
    }
  };

  applyView(readSavedView(), false);

  viewButtons.forEach((btn) => {
    btn.addEventListener(
      "click",
      () => {
        const next = btn.dataset.eqViewBtn;
        if (next !== "grid" && next !== "list") return;
        if (root.dataset.eqView === next) return;
        saveView(next);
        applyView(next, true);
      },
      { signal },
    );
  });

  /* 2. Combined Group Tab + Keyword Filter */
  let activeGroup = "all";
  let query = "";

  const applyFilter = (animate: boolean) => {
    const q = query.trim().toLowerCase();
    let totalVisible = 0;
    const visibleCards: HTMLElement[] = [];

    groups.forEach((group) => {
      const groupId = group.dataset.eqGroup ?? "";
      const groupAllowed = activeGroup === "all" || groupId === activeGroup;
      const cards = Array.from(
        group.querySelectorAll<HTMLElement>("[data-eq-card]"),
      );
      const countEl = group.querySelector<HTMLElement>("[data-eq-group-count]");

      let groupVisible = 0;
      cards.forEach((card) => {
        const haystack = (
          card.dataset.eqSearch ??
          card.textContent ??
          ""
        ).toLowerCase();
        const match = groupAllowed && (!q || haystack.includes(q));
        card.hidden = !match;
        if (match) {
          groupVisible += 1;
          totalVisible += 1;
          visibleCards.push(card);
        }
      });

      group.hidden = groupVisible === 0;
      if (countEl) {
        countEl.textContent = q
          ? `${groupVisible} / ${cards.length} 件`
          : `${cards.length} 件`;
      }
    });

    if (searchWrap) {
      searchWrap.classList.toggle("has-query", Boolean(q));
    }
    if (searchClear) {
      searchClear.hidden = !q;
    }
    if (searchCount) {
      if (q) {
        searchCount.textContent = `${totalVisible} 件`;
        searchCount.hidden = false;
      } else {
        searchCount.hidden = true;
      }
    }
    if (emptyFilter) {
      emptyFilter.hidden = totalVisible > 0 || groups.length === 0;
    }

    root
      .querySelectorAll<HTMLButtonElement>("[data-eq-spec-chip]")
      .forEach((chip) => {
        const val = (chip.dataset.eqSpecChip ?? "").trim().toLowerCase();
        const active = Boolean(q) && val === q;
        chip.classList.toggle("is-active", active);
        chip.setAttribute("aria-pressed", String(active));
      });

    if (animate) {
      animateCards(visibleCards);
    }
  };

  const setActiveGroup = (nextGroup: string, animate: boolean, updateUrl: boolean) => {
    const valid =
      nextGroup === "all" ||
      tabs.some((tab) => tab.dataset.eqFilter === nextGroup);
    activeGroup = valid ? nextGroup : "all";

    tabs.forEach((tab) => {
      const active = (tab.dataset.eqFilter ?? "all") === activeGroup;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });

    if (updateUrl) {
      syncUrlGroup(activeGroup);
    }
    applyFilter(animate);
  };

  // Honor ?group=<name> from URL on initial load
  const initialGroup = new URLSearchParams(location.search).get("group") ?? "";
  if (initialGroup && tabs.length > 0) {
    setActiveGroup(initialGroup, false, false);
  }

  tabs.forEach((tab, idx) => {
    tab.addEventListener(
      "click",
      () => {
        const target = tab.dataset.eqFilter ?? "all";
        if (target === activeGroup) return;
        setActiveGroup(target, true, true);
        tab.scrollIntoView({
          behavior: motionAllowed() ? "smooth" : "auto",
          inline: "nearest",
          block: "nearest",
        });
      },
      { signal },
    );

    tab.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
        event.preventDefault();
        const delta = event.key === "ArrowRight" ? 1 : -1;
        const nextTab = tabs[(idx + delta + tabs.length) % tabs.length];
        nextTab.focus();
        nextTab.click();
      },
      { signal },
    );
  });

  if (searchInput) {
    searchInput.addEventListener(
      "input",
      () => {
        query = searchInput.value;
        applyFilter(false);
      },
      { signal },
    );

    searchInput.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape" && searchInput.value) {
          event.preventDefault();
          searchInput.value = "";
          query = "";
          applyFilter(true);
        }
      },
      { signal },
    );
  }

  searchClear?.addEventListener(
    "click",
    () => {
      if (!searchInput) return;
      searchInput.value = "";
      query = "";
      applyFilter(true);
      searchInput.focus();
    },
    { signal },
  );

  resetBtn?.addEventListener(
    "click",
    () => {
      if (searchInput) searchInput.value = "";
      query = "";
      setActiveGroup("all", true, true);
    },
    { signal },
  );

  root.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const chip = target.closest<HTMLButtonElement>("[data-eq-spec-chip]");
      if (!chip) return;
      const spec = (chip.dataset.eqSpecChip ?? "").trim();
      if (!spec) return;

      const togglingOff = query.trim().toLowerCase() === spec.toLowerCase();
      query = togglingOff ? "" : spec;
      if (searchInput) searchInput.value = query;
      if (!togglingOff && activeGroup !== "all") {
        setActiveGroup("all", true, true);
      } else {
        applyFilter(true);
      }
      if (event.detail > 0) chip.blur();
    },
    { signal },
  );

  return () => {
    controller.abort();
  };
}
