/**
 * Opens Halo's search widget (plugin-search-widget) from any [data-search] trigger
 * (desktop header, mobile drawer, or future shortcuts) as well as Cmd/Ctrl + K.
 */
declare global {
  interface Window {
    SearchWidget?: { open: () => void };
  }
}

export function initSearch() {
  const triggers = document.querySelectorAll<HTMLElement>("[data-search]");
  if (!triggers.length) return;

  const open = () => window.SearchWidget?.open();

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const btn = target.closest<HTMLElement>("[data-search]");
    if (!btn) return;
    if (event.detail > 0) btn.blur();
    open();
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      open();
    }
  });
}
