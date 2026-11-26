export interface Overlay {
  open(origin?: HTMLElement | null): void;
  close(): void;
  toggle(origin?: HTMLElement | null): void;
  isOpen(): boolean;
}

/** Zero-flicker CSS-composited overlay controller with focus trapping & Escape dismissal. */
export function createOverlay(root: HTMLElement): Overlay {
  let opener: HTMLElement | null = null;
  const sheet = root.querySelector<HTMLElement>("[role='dialog']") ?? root;
  if (!sheet.hasAttribute("tabindex")) sheet.setAttribute("tabindex", "-1");

  const isOpen = () => root.classList.contains("is-open");

  const close = (restoreFocus = false) => {
    if (!isOpen()) return;
    root.classList.remove("is-open");
    root.setAttribute("aria-hidden", "true");
    opener?.setAttribute("aria-expanded", "false");
    if (restoreFocus) {
      opener?.focus({ preventScroll: true });
    }
  };

  const open = (origin?: HTMLElement | null) => {
    if (isOpen()) return;
    opener = origin ?? null;
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
    root.classList.add("is-open");
    opener?.setAttribute("aria-expanded", "true");
    sheet.focus({ preventScroll: true });
  };

  root
    .querySelectorAll("[data-cc-close], [data-close]")
    .forEach((element) => element.addEventListener("click", () => close(false)));

  const onKeydown = (event: KeyboardEvent) => {
    if (!root.isConnected) {
      document.removeEventListener("keydown", onKeydown);
      return;
    }
    if (!isOpen()) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    }
    if (event.key === "Tab") {
      const items = Array.from(
        sheet.querySelectorAll<HTMLElement>(
          "button:not([disabled]):not([hidden]), a[href], [tabindex='0']",
        ),
      ).filter((element) => !!element.getClientRects().length);
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  };
  document.addEventListener("keydown", onKeydown);

  return {
    open,
    close: () => close(false),
    isOpen,
    toggle: (origin) => (isOpen() ? close(false) : open(origin)),
  };
}
