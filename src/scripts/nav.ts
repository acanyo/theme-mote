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
  const menuButton =
    header?.querySelector<HTMLButtonElement>("[data-menu-toggle]");
  if (!header || !dock || !nav || !brand || !actions || !menuButton) return null;

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
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "关闭菜单" : "打开菜单");
    if (open) setHidden(false);
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

    lastY = window.scrollY;
    setOpen(false);
    setHidden(false);
    setScrolled(lastY > 36);
  };

  menuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = !isOpen();
    setOpen(open);
    if (open && event.detail === 0) {
      (activeLink ?? links[0])?.focus();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !isOpen()) return;
    setOpen(false);
    menuButton.focus();
  });

  document.addEventListener("click", (event) => {
    if (!isOpen() || !(event.target instanceof Element)) return;
    if (event.target.closest(".mobile-tool-pill[data-scheme-toggle]")) return;
    if (
      event.target.closest("[data-nav-close]") ||
      !header.contains(event.target) ||
      event.target.closest(".site-nav a, .mobile-tool-pill")
    )
      setOpen(false);
  });

  window.addEventListener("scroll", scheduleScroll, { passive: true });

  const smallScreen = matchMedia("(max-width: 720px)");
  const setCompact = (compact: boolean) => {
    root.toggleAttribute("data-compact", compact);
    header.toggleAttribute("data-compact", compact);
  };

  const layout = () => {
    if (smallScreen.matches) {
      setCompact(true);
      setHidden(false);
      return;
    }
    setCompact(false);
    const navWidth = navList ? navList.scrollWidth : nav.scrollWidth;
    const available = Math.min(window.innerWidth - 48, 700);
    const needed = brand.offsetWidth + navWidth + actions.offsetWidth + 32;
    const compact = needed > available + 1;
    setCompact(compact);
    if (compact) setHidden(false);
    else setOpen(false);
  };

  window.addEventListener("resize", layout);
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
