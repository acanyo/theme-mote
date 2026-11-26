/**
 * Single source of truth for whether decorative motion may run.
 * Motion stops when the system asks for reduced motion, when the site
 * owner disables it in theme settings, or when the visitor pauses it.
 */
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const root = document.documentElement;

export const MOTION_EVENT = "mote:motion";

export function motionAllowed(): boolean {
  return (
    !reduced.matches &&
    root.dataset.motion !== "off" &&
    root.dataset.motionSite !== "false"
  );
}

export function onMotionChange(callback: (allowed: boolean) => void) {
  document.addEventListener(MOTION_EVENT, () => callback(motionAllowed()));
}

function broadcast() {
  document.dispatchEvent(new CustomEvent(MOTION_EVENT));
}

export function initMotionToggle() {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-motion-toggle]"),
  );

  const sync = () => {
    const siteOff = root.dataset.motionSite === "false";
    const text = reduced.matches
      ? "已按系统设置减少动画"
      : motionAllowed()
        ? "暂停动画"
        : "播放动画";
    const desc = reduced.matches
      ? "已遵循系统的减少动态效果设置"
      : motionAllowed()
        ? "减少页面过渡与入场动效"
        : "已减弱页面过渡与入场动效";
    buttons.forEach((button) => {
      button.hidden = siteOff;
      button.disabled = reduced.matches;
      button.setAttribute("aria-pressed", String(!motionAllowed()));
      const label = button.querySelector("[data-motion-label]");
      if (label) label.textContent = text;
      const descEl = button.querySelector("[data-motion-desc]");
      if (descEl) descEl.textContent = desc;
    });
  };

  buttons.forEach((button) =>
    button.addEventListener("click", () => {
      root.dataset.motion = root.dataset.motion === "off" ? "on" : "off";
      try {
        localStorage.setItem("mote-motion", root.dataset.motion);
      } catch {
        /* storage unavailable: the choice lasts for this page only */
      }
      sync();
      broadcast();
    }),
  );

  document.addEventListener(MOTION_EVENT, sync);
  reduced.addEventListener("change", () => {
    sync();
    broadcast();
  });

  sync();
}
