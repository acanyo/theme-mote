/**
 * Builds the article outline from h2/h3, drives the sliding accent indicator,
 * adds copyable # heading anchors, and returns a cleanup handle for Swup.
 */
import { copyText } from "./actions";
import { motionAllowed } from "./motion";
import { toast } from "./toast";

function slugify(text: string, used: Set<string>) {
  const base =
    text
      .trim()
      .toLowerCase()
      .replace(/[\s　]+/g, "-")
      .replace(/[^\p{L}\p{N}-]/gu, "")
      .slice(0, 48) || "section";
  let id = base;
  let n = 2;
  while (used.has(id) || document.getElementById(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

export function initToc(article: HTMLElement, toc: HTMLElement): () => void {
  const headings = Array.from(
    article.querySelectorAll<HTMLHeadingElement>("h2, h3"),
  ).filter((heading) => heading.textContent?.trim());
  const list = toc.querySelector<HTMLOListElement>("[data-toc-list]");
  const tocBody = toc.querySelector<HTMLElement>(".toc-body");
  const indicator = toc.querySelector<HTMLElement>("[data-toc-indicator]");

  /* Mobile / Tablet Floating Reading Bar & Bottom-Sheet TOC */
  const mobileBar = document.querySelector<HTMLElement>(
    "[data-mobile-reading-bar]",
  );
  const mobileTocBtn = mobileBar?.querySelector<HTMLButtonElement>(
    "[data-mobile-toc-open]",
  );
  const mobileTocSep = mobileBar?.querySelector<HTMLElement>(
    "[data-mobile-toc-sep]",
  );
  const mobileModal = document.querySelector<HTMLElement>(
    "[data-mobile-toc-modal]",
  );
  const mobileList = mobileModal?.querySelector<HTMLOListElement>(
    "[data-mobile-toc-list]",
  );

  const closeMobileToc = () => {
    if (!mobileModal || mobileModal.hidden) return;
    mobileModal.hidden = true;
    document.body.classList.remove("is-nav-open");
  };

  const openMobileToc = () => {
    if (!mobileModal) return;
    mobileModal.hidden = false;
    document.body.classList.add("is-nav-open");
  };

  let lastMobileY = window.scrollY;
  const onMobileBarScroll = () => {
    if (!mobileBar) return;
    const y = Math.max(0, window.scrollY);
    const delta = y - lastMobileY;
    lastMobileY = y;

    const colophon = document.querySelector<HTMLElement>(".article-colophon");
    const nearColophon = colophon
      ? colophon.getBoundingClientRect().top < window.innerHeight - 60
      : false;

    if (y <= 180 || nearColophon) {
      mobileBar.classList.remove("is-visible");
      return;
    }
    if (delta > 8) {
      mobileBar.classList.remove("is-visible");
    } else if (delta < -6) {
      mobileBar.classList.add("is-visible");
    }
  };

  const onMobileKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") closeMobileToc();
  };

  if (mobileBar) {
    window.addEventListener("scroll", onMobileBarScroll, { passive: true });
    onMobileBarScroll();
  }

  if (headings.length < 2 || !list) {
    return () => {
      closeMobileToc();
      if (mobileBar) window.removeEventListener("scroll", onMobileBarScroll);
    };
  }

  list.innerHTML = "";
  if (mobileList) mobileList.innerHTML = "";
  const used = new Set<string>();
  const mobileLinks: HTMLAnchorElement[] = [];

  const links = headings.map((heading) => {
    const cleanText = heading.textContent?.replace(/#\s*$/, "").trim() ?? "";
    if (!heading.id) heading.id = slugify(cleanText, used);

    if (!heading.querySelector(".heading-anchor")) {
      const anchor = document.createElement("button");
      anchor.type = "button";
      anchor.className = "heading-anchor";
      anchor.textContent = "#";
      anchor.dataset.tip = "复制章节链接";
      anchor.setAttribute("aria-label", `复制「${cleanText}」章节链接`);
      anchor.addEventListener("click", async () => {
        const url = `${location.origin}${location.pathname}#${encodeURIComponent(heading.id)}`;
        history.replaceState(null, "", `#${encodeURIComponent(heading.id)}`);
        const ok = await copyText(url);
        toast(ok ? "已复制章节链接" : "复制失败");
      });
      heading.append(anchor);
    }

    const item = document.createElement("li");
    item.className = heading.tagName === "H3" ? "toc-item is-sub" : "toc-item";
    const link = document.createElement("a");
    link.href = `#${encodeURIComponent(heading.id)}`;
    link.textContent = cleanText;
    item.append(link);
    list.append(item);

    if (mobileList) {
      const mItem = document.createElement("li");
      mItem.className = heading.tagName === "H3" ? "is-sub" : "";
      const mLink = document.createElement("a");
      mLink.href = `#${encodeURIComponent(heading.id)}`;
      mLink.textContent = cleanText;
      mItem.append(mLink);
      mobileList.append(mItem);
      mobileLinks.push(mLink);
    }
    return link;
  });
  toc.hidden = false;

  if (mobileTocBtn && mobileLinks.length) {
    mobileTocBtn.hidden = false;
    if (mobileTocSep) mobileTocSep.hidden = false;
    mobileTocBtn.addEventListener("click", openMobileToc);
    mobileModal
      ?.querySelectorAll("[data-mobile-toc-close]")
      .forEach((el) => el.addEventListener("click", closeMobileToc));
    document.addEventListener("keydown", onMobileKey);
  }

  let active = -1;

  const moveIndicator = (link?: HTMLAnchorElement) => {
    if (!indicator || !link) return;
    const item = link.parentElement;
    if (!item) return;
    indicator.style.transform = `translate3d(0, ${item.offsetTop + 2}px, 0)`;
    indicator.style.height = `${Math.max(14, link.offsetHeight - 4)}px`;
    indicator.classList.add("is-ready");
  };

  const setActive = (index: number) => {
    if (index === active) return;
    links[active]?.classList.remove("is-active");
    links[active]?.removeAttribute("aria-current");
    mobileLinks[active]?.classList.remove("is-active");
    active = index;
    const link = links[index];
    link?.classList.add("is-active");
    link?.setAttribute("aria-current", "location");
    mobileLinks[index]?.classList.add("is-active");
    moveIndicator(link);

    /* Keep active link in view inside long scrollable TOCs */
    if (tocBody && link?.parentElement) {
      const item = link.parentElement;
      const top = item.offsetTop;
      const bottom = top + item.offsetHeight;
      if (top < tocBody.scrollTop + 12) {
        tocBody.scrollTo({ top: Math.max(0, top - 16), behavior: "smooth" });
      } else if (bottom > tocBody.scrollTop + tocBody.clientHeight - 12) {
        tocBody.scrollTo({
          top: bottom - tocBody.clientHeight + 16,
          behavior: "smooth",
        });
      }
    }
  };

  let frame = 0;
  const update = () => {
    frame = 0;
    const atPageBottom =
      window.scrollY + window.innerHeight >=
      document.documentElement.scrollHeight - 28;
    const articleBottom = article.getBoundingClientRect().bottom;
    if (atPageBottom || articleBottom <= window.innerHeight * 0.42) {
      setActive(headings.length - 1);
      return;
    }

    const line = window.innerHeight * 0.3;
    let index = -1;
    headings.forEach((heading, i) => {
      if (heading.getBoundingClientRect().top <= line) index = i;
    });
    setActive(Math.max(index, 0));
  };

  const onScroll = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  const onResize = () => {
    update();
    moveIndicator(links[active]);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);
  update();

  const bindJump = (link: HTMLAnchorElement, index: number, closeSheet = false) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      setActive(index);
      if (closeSheet) closeMobileToc();
      const heading = headings[index];
      heading.scrollIntoView({
        behavior: motionAllowed() ? "smooth" : "auto",
        block: "start",
      });
      history.replaceState(null, "", `#${encodeURIComponent(heading.id)}`);
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    });
  };

  links.forEach((link, index) => bindJump(link, index, false));
  mobileLinks.forEach((link, index) => bindJump(link, index, true));

  return () => {
    closeMobileToc();
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
    if (mobileBar) window.removeEventListener("scroll", onMobileBarScroll);
    document.removeEventListener("keydown", onMobileKey);
    if (frame) cancelAnimationFrame(frame);
  };
}
