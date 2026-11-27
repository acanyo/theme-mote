/**
 * Subtle editorial micro-enhancements for `.prose` long-form content:
 * - Universal hover `#` section anchors on h2/h3 (even when TOC is hidden or <2 headings)
 * - Smart auto-captions for standalone images with meaningful alt/title text
 * - Soft paper-fade collapse/expand for long code blocks (>22 lines / >460px)
 * - Safe rel="noopener noreferrer" on target="_blank" prose links
 */
import { copyText } from "./actions";
import { motionAllowed } from "./motion";
import { toast } from "./toast";

const JUNK_CAPTION_RE =
  /^(?:img|image|photo|pic|picture|screenshot|screen\s*shot|pasted\s*image|wx_camera|mmexport|dcim|dsc|pxl|untitled|cover|banner|thumb|thumbnail|avatar|微信图片|截屏|屏幕快照|图片)[\w\s._-]*$/i;
const FILE_EXT_RE = /\.(?:png|jpe?g|webp|gif|avif|svg|bmp|heic)$/i;
const URL_RE = /^https?:\/\//i;
const PURE_NUM_RE = /^[\d\s._:-]+$/;

function slugifyHeading(text: string, used: Set<string>): string {
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

function isMeaningfulCaption(raw: string): boolean {
  const text = raw.trim();
  if (text.length < 2 || text.length > 120) return false;
  if (URL_RE.test(text) || FILE_EXT_RE.test(text) || PURE_NUM_RE.test(text)) {
    return false;
  }
  if (JUNK_CAPTION_RE.test(text)) return false;
  return true;
}

function enhanceHeadingAnchors(prose: HTMLElement, signal: AbortSignal) {
  const headings = Array.from(
    prose.querySelectorAll<HTMLHeadingElement>("h2, h3"),
  ).filter((h) => h.textContent?.trim());
  if (!headings.length) return;

  const used = new Set<string>();
  headings.forEach((heading) => {
    if (heading.querySelector(".heading-anchor")) return;
    const cleanText = heading.textContent?.replace(/#\s*$/, "").trim() ?? "";
    if (!cleanText) return;
    if (!heading.id) heading.id = slugifyHeading(cleanText, used);

    const anchor = document.createElement("button");
    anchor.type = "button";
    anchor.className = "heading-anchor";
    anchor.textContent = "#";
    anchor.dataset.tip = "复制章节链接";
    anchor.setAttribute("aria-label", `复制「${cleanText}」章节链接`);
    anchor.addEventListener(
      "click",
      async () => {
        const url = `${location.origin}${location.pathname}#${encodeURIComponent(heading.id)}`;
        history.replaceState(null, "", `#${encodeURIComponent(heading.id)}`);
        const ok = await copyText(url);
        toast(ok ? "已复制章节链接" : "复制失败", ok ? "success" : "warn");
      },
      { signal },
    );
    heading.append(anchor);
  });
}

function enhanceImageCaptions(prose: HTMLElement) {
  prose.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
    if (img.dataset.captionChecked === "true") return;
    img.dataset.captionChecked = "true";

    if (
      img.classList.contains("img-error-custom") ||
      img.closest("figure, .gallery-group, [data-type='columns'], .columns, table")
    ) {
      return;
    }

    const attrWidth = Number.parseInt(img.getAttribute("width") ?? "", 10);
    if (Number.isFinite(attrWidth) && attrWidth > 0 && attrWidth < 120) return;

    const captionText = (
      img.getAttribute("title") ||
      img.getAttribute("alt") ||
      ""
    ).trim();
    if (!isMeaningfulCaption(captionText)) return;

    // Only wrap standalone paragraph images (<p><img /></p> or <p><a><img /></a></p>)
    const mediaNode =
      img.parentElement?.tagName === "A" &&
      img.parentElement.childNodes.length === 1
        ? img.parentElement
        : img;
    const p = mediaNode.parentElement;
    if (!p || p.tagName !== "P") return;

    const nonEmptyNodes = Array.from(p.childNodes).filter(
      (node) =>
        !(node.nodeType === Node.TEXT_NODE && !(node.textContent ?? "").trim()),
    );
    if (nonEmptyNodes.length !== 1 || nonEmptyNodes[0] !== mediaNode) return;

    const figure = document.createElement("figure");
    figure.className = "prose-auto-figure";

    const figcaption = document.createElement("figcaption");
    figcaption.className = "prose-auto-caption";
    figcaption.textContent = captionText;

    p.replaceWith(figure);
    figure.append(mediaNode, figcaption);
  });
}

function enhanceLongCodeBlocks(prose: HTMLElement, signal: AbortSignal) {
  prose.querySelectorAll<HTMLPreElement>("pre").forEach((pre) => {
    if (pre.dataset.codeFoldInit === "true") return;
    pre.dataset.codeFoldInit = "true";

    const codeText = (
      pre.querySelector("code")?.textContent ??
      pre.textContent ??
      ""
    ).replace(/\n$/, "");
    const lines = codeText ? codeText.split(/\r?\n/).length : 0;

    if (lines < 22 || pre.scrollHeight <= 460) return;

    pre.classList.add("is-collapsible", "is-collapsed");

    const bar = document.createElement("div");
    bar.className = "code-fold-bar";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "code-fold-btn";
    btn.setAttribute("aria-expanded", "false");

    const label = document.createElement("span");
    label.textContent = `展开全部代码 · 共 ${lines} 行`;

    const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    chevron.setAttribute("class", "code-fold-chevron");
    chevron.setAttribute("width", "12");
    chevron.setAttribute("height", "12");
    chevron.setAttribute("viewBox", "0 0 24 24");
    chevron.setAttribute("fill", "none");
    chevron.setAttribute("stroke", "currentColor");
    chevron.setAttribute("stroke-width", "1.9");
    chevron.setAttribute("stroke-linecap", "round");
    chevron.setAttribute("stroke-linejoin", "round");
    chevron.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "m7 10 5 5 5-5");
    chevron.append(path);

    btn.append(label, chevron);
    bar.append(btn);
    pre.append(bar);

    btn.addEventListener(
      "click",
      () => {
        const collapsed = pre.classList.toggle("is-collapsed");
        btn.setAttribute("aria-expanded", String(!collapsed));
        label.textContent = collapsed
          ? `展开全部代码 · 共 ${lines} 行`
          : "收起代码";
        if (collapsed) {
          const rect = pre.getBoundingClientRect();
          if (rect.top < 76) {
            pre.scrollIntoView({
              behavior: motionAllowed() ? "smooth" : "auto",
              block: "nearest",
            });
          }
        }
      },
      { signal },
    );
  });
}

function hardenExternalLinks(prose: HTMLElement) {
  prose.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]').forEach((a) => {
    const rel = new Set((a.getAttribute("rel") ?? "").split(/\s+/).filter(Boolean));
    rel.add("noopener");
    rel.add("noreferrer");
    a.setAttribute("rel", Array.from(rel).join(" "));
  });
}

export function initProseEnhancements(): () => void {
  const containers = Array.from(
    document.querySelectorAll<HTMLElement>(".prose"),
  );
  if (!containers.length) return () => {};

  const controller = new AbortController();
  containers.forEach((prose) => {
    enhanceHeadingAnchors(prose, controller.signal);
    enhanceImageCaptions(prose);
    enhanceLongCodeBlocks(prose, controller.signal);
    hardenExternalLinks(prose);
  });

  return () => {
    controller.abort();
  };
}
