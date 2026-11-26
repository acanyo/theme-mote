/** Fills [data-since="YYYY-MM-DD"] and 10-year pact progress [data-decade]. */
const DAY = 86_400_000;
const TEN_YEARS_DAYS = 3652.5;

export function initSince() {
  document.querySelectorAll<HTMLElement>("[data-since]").forEach((element) => {
    const start = Date.parse(element.dataset.since ?? "");
    if (Number.isNaN(start)) return;
    const days = Math.max(0, Math.floor((Date.now() - start) / DAY));
    element.textContent = days.toLocaleString("en-US");
  });

  document.querySelectorAll<HTMLElement>("[data-decade]").forEach((box) => {
    const start = Date.parse(box.dataset.decade ?? "");
    if (Number.isNaN(start)) return;
    const days = Math.max(0, (Date.now() - start) / DAY);
    const pct = Math.min(100, Math.max(1, Math.round((days / TEN_YEARS_DAYS) * 100)));
    const label = box.querySelector<HTMLElement>("[data-decade-pct]");
    const bar = box.querySelector<HTMLElement>("[data-decade-bar]");
    if (label) label.textContent = `${pct}%`;
    if (bar) bar.style.width = `${pct}%`;
  });
}
