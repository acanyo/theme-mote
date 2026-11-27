import { sameDestination } from "./url";

const sectionPaths: Record<string, string> = {
  post: "/archives",
  category: "/categories",
  tag: "/tags",
  moment: "/moments",
  photos: "/photos",
  links: "/links",
  portfolio: "/portfolio",
  equipments: "/equipments",
  douban: "/douban",
};

export interface NavController {
  syncPage: () => void;
}

export function initNav(): NavController | null {
  const header = document.querySelector<HTMLElement>("[data-header]");
  const dock = header?.querySelector<HTMLElement>("[data-header-dock]");
  const nav = header?.querySelector<HTMLElement>("[data-nav]");
  const navList = nav?.querySelector<HTMLElement>(".nav-list");
  const brand = dock?.querySelector<HTMLElement>(".header-wing--left");
  const actions = dock?.querySelector<HTMLElement>(".header-wing--right");
  const menuButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-menu-toggle]"),
  );
  const menuButton =
    header?.querySelector<HTMLButtonElement>("[data-menu-toggle]");
  if (!header || !dock || !nav || !brand || !actions || !menuButton) return null;

  const tabbarShell = document.querySelector<HTMLElement>(
    "[data-mobile-tabbar]",
  );
  const tabbarLinks = tabbarShell
    ? Array.from(
        tabbarShell.querySelectorAll<HTMLAnchorElement>(
          "[data-tabbar-link], .tabbar-sub-link, .tabbar-sub-parent",
        ),
      )
    : [];
  const tabbarSubBtns = tabbarShell
    ? Array.from(
        tabbarShell.querySelectorAll<HTMLButtonElement>("[data-tabbar-sub]"),
      )
    : [];
  const tabbarPanels = tabbarShell
    ? Array.from(
        tabbarShell.querySelectorAll<HTMLElement>("[data-tabbar-panel]"),
      )
    : [];

  let openTabSubId: string | null = null;
  const setTabSubOpen = (id: string | null) => {
    if (!tabbarShell) return;
    openTabSubId = id;
    tabbarShell.classList.toggle("has-sub-open", Boolean(id));
    tabbarSubBtns.forEach((btn) => {
      const active = btn.dataset.tabbarSub === id;
      btn.classList.toggle("is-open", active);
      btn.setAttribute("aria-expanded", String(active));
    });
    tabbarPanels.forEach((panel) => {
      const active = panel.dataset.tabbarPanel === id;
      if (active) {
        panel.hidden = false;
        requestAnimationFrame(() => panel.classList.add("is-open"));
      } else {
        panel.classList.remove("is-open");
        window.setTimeout(() => {
          if (openTabSubId !== panel.dataset.tabbarPanel) {
            panel.hidden = true;
          }
        }, 180);
      }
    });
  };

  const links = Array.from(
    (navList ?? nav).querySelectorAll<HTMLAnchorElement>("a[href]"),
  );
  const cleanPath = (path: string) => path.replace(/\/+$/, "") || "/";

  let activeLink: HTMLAnchorElement | undefined;
  let lastY = window.scrollY;
  let lastScrolled: boolean | null = null;
  let lastHidden: boolean | null = null;
  let scrollFrame = 0;
  let hovered = false;

  const root = document.documentElement;
  const isCompact = () => root.hasAttribute("data-compact");
  const isOpen = () => header.classList.contains("is-open");

  const setOpen = (open: boolean) => {
    const activeCompact = isCompact();
    header.classList.toggle("is-open", open);
    if (open && activeCompact) {
      const sbw = Math.max(0, window.innerWidth - root.clientWidth);
      root.style.setProperty("--nav-lock-pad", `${sbw}px`);
      document.body.classList.add("is-nav-open");
    } else {
      document.body.classList.remove("is-nav-open");
      root.style.removeProperty("--nav-lock-pad");
    }
    menuButtons.forEach((btn) => {
      btn.setAttribute("aria-expanded", String(open));
      btn.setAttribute("aria-label", open ? "关闭菜单" : "打开菜单");
      btn.classList.toggle("is-open", open);
    });
    if (open) {
      setTabSubOpen(null);
      setHidden(false);
    }
  };

  const setScrolled = (scrolled: boolean) => {
    if (scrolled === lastScrolled) return;
    lastScrolled = scrolled;
    header.classList.toggle("is-scrolled", scrolled);
  };

  const setHidden = (hidden: boolean) => {
    if (hidden === lastHidden) return;
    lastHidden = hidden;
    header.classList.toggle("is-hidden", hidden);
  };

  const syncScroll = () => {
    scrollFrame = 0;
    const y = Math.max(0, window.scrollY);
    const delta = y - lastY;
    lastY = y;

    setScrolled(y > (isCompact() ? 8 : 36));

    if (y <= 80 || isOpen() || hovered || isCompact()) {
      setHidden(false);
      return;
    }

    if (delta > 6) {
      setHidden(true);
    } else if (delta < -8) {
      setHidden(false);
    }
  };

  const scheduleScroll = () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(syncScroll);
  };

  header.addEventListener("mouseenter", () => {
    hovered = true;
    setHidden(false);
  });
  header.addEventListener("mouseleave", () => {
    hovered = false;
  });

  const syncPage = () => {
    links.forEach((link) => {
      link.classList.remove("is-current");
      link.removeAttribute("aria-current");
    });

    const currentPath = cleanPath(location.pathname);
    const exactMatches = links.filter(sameDestination);
    const sectionPath = sectionPaths[document.body.dataset.page ?? ""];
    const fallbackMatches = exactMatches.length
      ? []
      : links.filter((link) => {
          try {
            const url = new URL(link.href, location.href);
            if (url.origin !== location.origin || url.hash) return false;
            const target = cleanPath(url.pathname);
            if (sectionPath && target === sectionPath) return true;
            return target !== "/" && currentPath.startsWith(`${target}/`);
          } catch {
            return false;
          }
        });

    const matched = exactMatches.length ? exactMatches : fallbackMatches;
    activeLink = matched[0];
    const activeItem = activeLink?.closest(".nav-item");

    if (activeItem) {
      matched
        .filter((link) => link.closest(".nav-item") === activeItem)
        .forEach((link) => {
          link.classList.add("is-current");
          if (exactMatches.includes(link)) {
            link.setAttribute("aria-current", "page");
          }
        });
      activeItem.querySelector(".nav-link")?.classList.add("is-current");
    }

    // Sync Bottom TabControl active state (direct links + parent tabs of active submenu links)
    tabbarLinks.forEach((link) => {
      link.classList.remove("is-current");
      link.removeAttribute("aria-current");
    });
    tabbarSubBtns.forEach((btn) => btn.classList.remove("is-current"));

    const matchTabLink = (link: HTMLAnchorElement) => {
      if (sameDestination(link)) return true;
      try {
        const url = new URL(link.href, location.href);
        if (url.origin !== location.origin || url.hash) return false;
        const target = cleanPath(url.pathname);
        if (sectionPath && target === sectionPath) return true;
        return target !== "/" && currentPath.startsWith(`${target}/`);
      } catch {
        return false;
      }
    };

    const matchedTabs = tabbarLinks.filter(matchTabLink);
    matchedTabs.forEach((link) => {
      link.classList.add("is-current");
      if (sameDestination(link)) link.setAttribute("aria-current", "page");
      const panel = link.closest<HTMLElement>("[data-tabbar-panel]");
      if (panel?.dataset.tabbarPanel) {
        tabbarSubBtns
          .find((b) => b.dataset.tabbarSub === panel.dataset.tabbarPanel)
          ?.classList.add("is-current");
      }
    });

    lastY = window.scrollY;
    setTabSubOpen(null);
    setOpen(false);
    setHidden(false);
    setScrolled(lastY > 36);
  };

  menuButtons.forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (event.detail > 0) btn.blur();
      const open = !isOpen();
      setOpen(open);
      if (open && event.detail === 0) {
        (activeLink ?? links[0])?.focus();
      }
    });
  });

  tabbarSubBtns.forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (event.detail > 0) btn.blur();
      const id = btn.dataset.tabbarSub ?? null;
      setOpen(false);
      setTabSubOpen(openTabSubId === id ? null : id);
    });
  });

  tabbarShell
    ?.querySelectorAll("[data-tabbar-sub-close]")
    .forEach((el) => el.addEventListener("click", () => setTabSubOpen(null)));

  tabbarLinks.forEach((link) =>
    link.addEventListener("click", () => setTabSubOpen(null)),
  );

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (openTabSubId) {
      setTabSubOpen(null);
      return;
    }
    if (!isOpen()) return;
    setOpen(false);
    menuButton.focus();
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (openTabSubId && tabbarShell && !tabbarShell.contains(event.target)) {
      setTabSubOpen(null);
    }
    if (!isOpen()) return;
    if (event.target.closest(".mobile-tool-pill[data-scheme-toggle]")) return;
    if (
      event.target.closest("[data-nav-close]") ||
      (!header.contains(event.target) && !tabbarShell?.contains(event.target)) ||
      event.target.closest(".site-nav a, .mobile-tool-pill")
    )
      setOpen(false);
  });

  window.addEventListener("scroll", scheduleScroll, { passive: true });

  const smallScreen = matchMedia("(max-width: 720px)");
  const brandEl = brand.querySelector<HTMLElement>(".brand") ?? brand;
  const actionsEl =
    actions.querySelector<HTMLElement>(".header-actions") ?? actions;
  const setCompact = (compact: boolean) => {
    root.toggleAttribute("data-compact", compact);
    header.toggleAttribute("data-compact", compact);
  };

  const measureNavWidth = () => {
    if (!navList) return nav.getBoundingClientRect().width;
    const items = Array.from(navList.children);
    const itemsWidth = items.reduce(
      (sum, item) => sum + item.getBoundingClientRect().width,
      0,
    );
    return itemsWidth + Math.max(0, items.length - 1) * 2;
  };

  const layout = () => {
    if (smallScreen.matches) {
      setCompact(true);
      setHidden(false);
      return;
    }
    setCompact(false);
    setOpen(false);
    setTabSubOpen(null);
    // Force clean desktop reflow before measuring intrinsic widths (ignoring absolute .nav-sub)
    void header.offsetWidth;
    const navWidth = measureNavWidth();
    const available = Math.min(window.innerWidth - 48, 700);
    const needed =
      brandEl.getBoundingClientRect().width +
      navWidth +
      actionsEl.getBoundingClientRect().width +
      24;
    const compact = needed > available + 1;
    setCompact(compact);
    if (compact) setHidden(false);
  };

  window.addEventListener("resize", layout);
  smallScreen.addEventListener?.("change", layout);
  void document.fonts?.ready.then(layout);
  syncPage();
  layout();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.dataset.navReady = "true";
    });
  });

  return { syncPage };
}
