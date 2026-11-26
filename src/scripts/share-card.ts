/**
 * Minimal Editorial Bookmark Share Card Generator (Print Postcard Edition):
 * - Lazy-loads `qrcode` only when user clicks "书签图" (0 bytes on initial load)
 * - Full-bleed top photography, book-serif headline, fine-art paper tone,
 *   cover-palette subtle accenting, and crisp scannable QR code
 */
import { createOverlay } from "./overlay";
import { toast } from "./toast";

interface ShareMeta {
  title: string;
  excerpt: string;
  author: string;
  date: string;
  site: string;
  category: string;
  cover: string;
  url: string;
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const lines: string[] = [];
  let line = "";

  for (const ch of cleaned) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line.length > 0) {
      lines.push(line);
      if (lines.length === maxLines) {
        const last = lines[maxLines - 1];
        lines[maxLines - 1] =
          last.length > 1 ? `${last.slice(0, -1).trimEnd()}…` : `${last}…`;
        return lines;
      }
      line = ch === " " ? "" : ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function parseHex(raw: string): [number, number, number] | null {
  const hex = raw.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [
      Number.parseInt(hex[0] + hex[0], 16),
      Number.parseInt(hex[1] + hex[1], 16),
      Number.parseInt(hex[2] + hex[2], 16),
    ];
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ];
  }
  return null;
}

function mixHex(
  fgHex: string,
  bgRgb: [number, number, number],
  ratio: number,
): string {
  const fg = parseHex(fgHex);
  const toHex = (n: number) =>
    Math.min(255, Math.max(0, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  if (!fg) return `#${toHex(bgRgb[0])}${toHex(bgRgb[1])}${toHex(bgRgb[2])}`;
  const r = bgRgb[0] + (fg[0] - bgRgb[0]) * ratio;
  const g = bgRgb[1] + (fg[1] - bgRgb[1]) * ratio;
  const b = bgRgb[2] + (fg[2] - bgRgb[2]) * ratio;
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexAlpha(hex: string, alpha: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return `rgba(37, 99, 235, ${alpha})`;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function loadCoverImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    try {
      const sameOrigin = new URL(src, location.href).origin === location.origin;
      if (!sameOrigin) img.crossOrigin = "anonymous";
    } catch {
      /* Ignore URL parse errors. */
    }
    img.decoding = "async";
    img.onload = () => {
      try {
        const probe = document.createElement("canvas");
        probe.width = 2;
        probe.height = 2;
        const pctx = probe.getContext("2d");
        pctx?.drawImage(img, 0, 0, 2, 2);
        probe.toDataURL();
        resolve(img);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function readPageColors(paper: "light" | "dark") {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const coverActive =
    root.dataset.coverPaletteActive === "true" &&
    root.dataset.coverPaletteOverride !== "true";

  const accent =
    (coverActive
      ? paper === "dark"
        ? root.style.getPropertyValue("--page-primary-dark").trim()
        : root.style.getPropertyValue("--page-primary").trim()
      : cs.getPropertyValue("--accent").trim()) ||
    (paper === "dark" ? "#93c5fd" : "#2563eb");

  const secondary =
    (coverActive
      ? paper === "dark"
        ? root.style.getPropertyValue("--page-secondary-dark").trim()
        : root.style.getPropertyValue("--page-secondary").trim()
      : cs.getPropertyValue("--accent-secondary").trim()) || "#f0b890";

  return { accent, secondary };
}

function formatEditorialDate(raw: string): string {
  const m = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]} · ${m[2]} · ${m[3]}` : raw;
}

async function renderShareCard(
  canvas: HTMLCanvasElement,
  meta: ShareMeta,
  paper: "light" | "dark",
) {
  const DPR = 2;
  const W = 420;
  const PAD = 34;
  const INNER_W = W - PAD * 2;
  const coverImg = await loadCoverImage(meta.cover);
  const { accent, secondary } = readPageColors(paper);

  const isDark = paper === "dark";
  // Fine-art paper tone: subtly tinted 2-3% toward the cover hue (never harsh sterile white)
  const bg = isDark
    ? mixHex(accent, [20, 20, 22], 0.04)
    : mixHex(accent, [252, 251, 249], 0.025);
  const ink = isDark ? "#ededee" : "#18181b";
  const ink2 = isDark ? "#a1a1aa" : "#52525b";
  const ink3 = isDark ? "#71717a" : "#8e8e93";
  const rule = isDark ? "rgba(255, 255, 255, 0.09)" : "rgba(24, 24, 27, 0.08)";

  const fontSerif =
    '"Noto Serif SC", "Songti SC", "STSong", "Source Han Serif SC", Georgia, serif';
  const fontSans =
    '"Inter", -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  const fontMono =
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

  const measureCtx = canvas.getContext("2d");
  if (!measureCtx) return;

  const titleSize = coverImg ? 22 : 25;
  const titleLead = coverImg ? 32 : 36;
  measureCtx.font = `600 ${titleSize}px ${fontSerif}`;
  const titleLines = wrapLines(measureCtx, meta.title, INNER_W, 3);

  measureCtx.font = `400 13.5px ${fontSans}`;
  const excerptLines = wrapLines(measureCtx, meta.excerpt, INNER_W, 3);

  const coverH = coverImg ? 236 : 0;
  const topOffset = coverImg ? coverH + 26 : 42;
  const metaRowH = 26;
  const titleBlockH = titleLines.length * titleLead;
  const excerptBlockH =
    excerptLines.length > 0 ? 14 + excerptLines.length * 23 : 0;
  const footerGap = 28;
  const footerH = 88;
  const H = Math.max(
    410,
    topOffset + metaRowH + titleBlockH + excerptBlockH + footerGap + footerH + PAD,
  );

  canvas.width = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(DPR, DPR);

  // 1. Fine-art paper canvas
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 2. Full-bleed edge-to-edge cover photograph OR serene radial aura when coverless
  if (coverImg && coverH > 0) {
    const imgRatio = coverImg.naturalWidth / coverImg.naturalHeight;
    const boxRatio = W / coverH;
    let sx = 0;
    let sy = 0;
    let sw = coverImg.naturalWidth;
    let sh = coverImg.naturalHeight;
    if (imgRatio > boxRatio) {
      sw = coverImg.naturalHeight * boxRatio;
      sx = (coverImg.naturalWidth - sw) / 2;
    } else {
      sh = coverImg.naturalWidth / boxRatio;
      sy = (coverImg.naturalHeight - sh) / 2;
    }
    ctx.drawImage(coverImg, sx, sy, sw, sh, 0, 0, W, coverH);

    // Whisper bottom feather blending the photo gently into fine-art paper
    const feather = ctx.createLinearGradient(0, coverH - 42, 0, coverH);
    feather.addColorStop(0, "rgba(0,0,0,0)");
    feather.addColorStop(1, bg);
    ctx.fillStyle = feather;
    ctx.fillRect(0, coverH - 42, W, 43);
  } else {
    // Coverless typographic card: soft corner radial light with zero hard edge
    const radial = ctx.createRadialGradient(W * 0.88, 0, 12, W * 0.88, 0, 260);
    radial.addColorStop(0, hexAlpha(accent, isDark ? 0.22 : 0.14));
    radial.addColorStop(0.55, hexAlpha(secondary, isDark ? 0.08 : 0.06));
    radial.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, W, 280);
  }

  let y = topOffset;

  // 3. Editorial Meta Row: Accent dot + Category on left, Mono Date on right
  ctx.textBaseline = "middle";
  const metaMidY = y + 8;
  if (meta.category) {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(PAD + 3, metaMidY, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = accent;
    ctx.font = `500 12px ${fontSans}`;
    ctx.textAlign = "left";
    ctx.fillText(meta.category, PAD + 12, metaMidY + 0.5);
  } else {
    ctx.fillStyle = accent;
    ctx.fillRect(PAD, metaMidY - 1, 18, 2);
  }

  if (meta.date) {
    ctx.fillStyle = ink3;
    ctx.font = `400 11px ${fontMono}`;
    ctx.textAlign = "right";
    ctx.fillText(formatEditorialDate(meta.date), W - PAD, metaMidY + 0.5);
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  y += metaRowH;

  // 4. Book-Serif Editorial Headline
  ctx.fillStyle = ink;
  ctx.font = `600 ${titleSize}px ${fontSerif}`;
  for (const lineText of titleLines) {
    ctx.fillText(lineText, PAD, y);
    y += titleLead;
  }

  // 5. Quiet Excerpt
  if (excerptLines.length > 0) {
    y += 12;
    ctx.fillStyle = ink2;
    ctx.font = `400 13.5px ${fontSans}`;
    for (const lineText of excerptLines) {
      ctx.fillText(lineText, PAD, y);
      y += 23;
    }
  }

  // 6. Clean Hairline Divider & Colophon Footer
  const footTop = H - PAD - footerH;
  ctx.strokeStyle = rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, footTop + 0.5);
  ctx.lineTo(W - PAD, footTop + 0.5);
  ctx.stroke();

  const qrSize = 64;
  const footContentY = footTop + 22;

  ctx.fillStyle = ink;
  ctx.font = `600 14px ${fontSerif}`;
  ctx.fillText(meta.site || "Mote", PAD, footContentY + 2);

  ctx.fillStyle = ink2;
  ctx.font = `400 12px ${fontSans}`;
  ctx.fillText(meta.author ? `文 / ${meta.author}` : "长按识别二维码阅读", PAD, footContentY + 26);

  let hostLabel = "";
  try {
    hostLabel = new URL(meta.url).host;
  } catch {
    hostLabel = "";
  }
  ctx.fillStyle = ink3;
  ctx.font = `400 10.5px ${fontMono}`;
  ctx.fillText(
    hostLabel ? `扫码阅读 · ${hostLabel}` : "扫码阅读全文",
    PAD,
    footContentY + 47,
  );

  // Harmonized QR Code printed directly onto paper (zero clunky box)
  const qrX = W - PAD - qrSize;
  const qrY = footTop + 20;
  try {
    const QRCode = await import("qrcode");
    const qrCanvas = document.createElement("canvas");
    await QRCode.toCanvas(qrCanvas, meta.url, {
      width: qrSize * DPR,
      margin: 0,
      errorCorrectionLevel: "M",
      color: {
        dark: isDark ? "#e4e4e7" : "#27272a",
        light: bg,
      },
    });
    ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
  } catch {
    /* QR render optional fallback */
  }
}

export function initShareCard(): () => void {
  const modal = document.querySelector<HTMLElement>("[data-share-modal]");
  const trigger = document.querySelector<HTMLButtonElement>("[data-share-card-open]");
  if (!modal || !trigger) return () => {};

  const canvas = modal.querySelector<HTMLCanvasElement>("[data-share-canvas]");
  const loadingEl = modal.querySelector<HTMLElement>("[data-share-loading]");
  const downloadBtn = modal.querySelector<HTMLButtonElement>("[data-share-download]");
  const copyBtn = modal.querySelector<HTMLButtonElement>("[data-share-copy]");
  const themeBtns = Array.from(
    modal.querySelectorAll<HTMLButtonElement>("[data-share-theme]"),
  );
  if (!canvas) return () => {};

  const overlay = createOverlay(modal);
  const controller = new AbortController();
  let paper: "light" | "dark" = document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";

  const collectMeta = (): ShareMeta => {
    const firstP = document.querySelector<HTMLElement>("[data-article-body] p");
    const excerpt =
      (trigger.dataset.shareExcerpt || "").trim() ||
      (firstP?.textContent || "").trim().slice(0, 120);
    return {
      title: (trigger.dataset.shareTitle || document.title).trim(),
      excerpt,
      author: (trigger.dataset.shareAuthor || "").trim(),
      date: (trigger.dataset.shareDate || "").trim(),
      site: (trigger.dataset.shareSite || "").trim(),
      category: (trigger.dataset.shareCategory || "").trim(),
      cover: (trigger.dataset.shareCover || "").trim(),
      url: location.href,
    };
  };

  const syncThemeBtns = () => {
    themeBtns.forEach((btn) => {
      const active = btn.dataset.shareTheme === paper;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-checked", String(active));
    });
  };

  const draw = async () => {
    if (loadingEl) loadingEl.hidden = false;
    await renderShareCard(canvas, collectMeta(), paper);
    if (loadingEl) loadingEl.hidden = true;
  };

  trigger.addEventListener(
    "click",
    () => {
      paper = document.documentElement.classList.contains("dark")
        ? "dark"
        : "light";
      syncThemeBtns();
      overlay.open(trigger);
      void draw();
    },
    { signal: controller.signal },
  );

  themeBtns.forEach((btn) => {
    btn.addEventListener(
      "click",
      () => {
        const next = btn.dataset.shareTheme;
        if ((next === "light" || next === "dark") && next !== paper) {
          paper = next;
          syncThemeBtns();
          void draw();
        }
      },
      { signal: controller.signal },
    );
  });

  downloadBtn?.addEventListener(
    "click",
    () => {
      try {
        const link = document.createElement("a");
        const safeName = (trigger.dataset.shareTitle || "mote-bookmark")
          .replace(/[\\/:*?"<>|]+/g, "-")
          .slice(0, 48);
        link.download = `${safeName}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        toast("书签图已保存", "success");
      } catch {
        toast("导出失败，请右键图片保存", "info");
      }
    },
    { signal: controller.signal },
  );

  copyBtn?.addEventListener(
    "click",
    () => {
      if (
        typeof ClipboardItem === "undefined" ||
        !navigator.clipboard?.write
      ) {
        toast("当前浏览器不支持复制图片，请点击保存图片", "info");
        return;
      }
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
          toast("书签图已复制到剪贴板", "success");
        } catch {
          toast("复制受限，请直接点击保存图片", "info");
        }
      }, "image/png");
    },
    { signal: controller.signal },
  );

  return () => {
    controller.abort();
    overlay.close();
  };
}
