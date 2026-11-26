import { gsap, travelEase, settleEase } from "./engine";
import { motionAllowed, onMotionChange } from "../motion";

/** Native focus and dismissal with a short, interruptible fade. */
export function createDialogMotion(
  dialog: HTMLDialogElement,
  closeSelector: string,
) {
  let timeline: gsap.core.Timeline | undefined;
  let closing = false;
  let opener: HTMLElement | null = null;
  const content = () =>
    dialog.querySelectorAll<HTMLElement>(
      ".reader-bar, .reader-content > *, .reading-local, .reading-list, .reading-empty",
    );
  const reset = () =>
    gsap.set([dialog, ...content()], {
      clearProps: "transform,opacity,visibility",
    });
  const close = () => {
    if (!dialog.open || closing) return;
    closing = true;
    timeline?.kill();
    const finish = () => {
      dialog.close();
      closing = false;
      reset();
      opener?.focus({ preventScroll: true });
    };
    if (!motionAllowed()) {
      finish();
      return;
    }
    timeline = gsap.timeline({ onComplete: finish });
    timeline.to(
      content(),
      { opacity: 0, y: 5, duration: 0.13, ease: "power2.in" },
      0,
    );
    timeline.to(
      dialog,
      {
        autoAlpha: 0,
        y: 10,
        scaleX: 0.98,
        scaleY: 0.98,
        duration: 0.18,
        ease: "power2.in",
      },
      0.025,
    );
  };
  const open = (origin?: HTMLElement | null) => {
    timeline?.kill();
    closing = false;
    opener =
      origin ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    reset();
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    if (!motionAllowed()) return;
    const mobile = matchMedia("(max-width:640px)").matches;
    gsap.set(dialog, {
      transformOrigin: "50% 50%",
    });
    timeline = gsap.timeline({ defaults: { ease: travelEase } });
    timeline.fromTo(
      dialog,
      {
        autoAlpha: 0,
        x: 0,
        y: mobile ? 20 : 12,
        scaleX: 0.98,
        scaleY: 0.98,
      },
      {
        autoAlpha: 1,
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        duration: 0.28,
        ease: settleEase,
        clearProps: "transform,opacity,visibility",
      },
      0,
    );
    timeline.fromTo(
      content(),
      { autoAlpha: 0, y: 10 },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.22,
        stagger: 0.015,
        clearProps: "transform,opacity,visibility",
      },
      0.04,
    );
  };
  dialog.querySelector(closeSelector)?.addEventListener("click", close);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });
  dialog.addEventListener("click", (event) => {
    const box = dialog.getBoundingClientRect();
    if (
      event.target === dialog &&
      (event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom)
    )
      close();
  });
  onMotionChange((allowed) => {
    if (!allowed) timeline?.progress(1);
  });
  return { open, close };
}
