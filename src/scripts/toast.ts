/**
 * Global Weak-Notification Toast (non-intrusive frosted bottom pill).
 * Auto-infers subtle semantic icon tone when omitted.
 */
export type ToastTone = "default" | "success" | "info" | "warn" | "heart";

const ICONS: Record<ToastTone, string> = {
  success: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  heart: `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.4s-7-4.5-9.2-8.7C1.1 8.5 2.7 4.8 6.4 4.3c2.1-.3 3.9.7 5.6 2.5 1.7-1.8 3.5-2.8 5.6-2.5 3.7.5 5.3 4.2 3.6 7.4C19 15.9 12 20.4 12 20.4Z"></path></svg>`,
  warn: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><line x1="12" y1="8" x2="12" y2="12.5"></line><circle cx="12" cy="16" r="0.8" fill="currentColor"></circle></svg>`,
  info: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><line x1="12" y1="11" x2="12" y2="16"></line><circle cx="12" cy="8" r="0.8" fill="currentColor"></circle></svg>`,
  default: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor"></circle></svg>`,
};

function inferTone(message: string): ToastTone {
  if (/失败|不支持|还没有|请先|请填写|异常|错误/.test(message)) return "warn";
  if (/已经点过赞|点过赞/.test(message)) return "info";
  if (/喜欢|点赞|谢谢/.test(message)) return "heart";
  if (/复制|提交|成功|保存|收藏/.test(message)) return "success";
  return "info";
}

let region: HTMLElement | null = null;
let iconEl: HTMLElement | null = null;
let textEl: HTMLElement | null = null;
let timer = 0;

function ensureRegion(): HTMLElement {
  if (region && region.isConnected) return region;
  region = document.createElement("div");
  region.className = "mote-toast";
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");

  iconEl = document.createElement("span");
  iconEl.className = "mote-toast-icon";
  iconEl.setAttribute("aria-hidden", "true");

  textEl = document.createElement("span");
  textEl.className = "mote-toast-text";

  region.append(iconEl, textEl);
  document.body.append(region);
  return region;
}

export function toast(message: string, tone?: ToastTone, duration = 2200) {
  const el = ensureRegion();
  const resolvedTone = tone ?? inferTone(message);
  const wasShown = el.classList.contains("is-shown");

  el.dataset.tone = resolvedTone;
  if (iconEl) iconEl.innerHTML = ICONS[resolvedTone];
  if (textEl) textEl.textContent = message;

  if (wasShown) {
    el.classList.remove("is-bump");
    void el.offsetWidth;
    el.classList.add("is-bump");
  } else {
    el.classList.remove("is-bump");
    el.classList.add("is-shown");
  }

  clearTimeout(timer);
  timer = window.setTimeout(() => {
    region?.classList.remove("is-shown", "is-bump");
  }, duration);
}
