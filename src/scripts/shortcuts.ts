/**
 * Keyboard shortcuts (see lib/shortcuts.ts). Active only when the help
 * sheet was rendered, i.e. the theme setting is on. Ignored while typing
 * in a field. Ctrl/Cmd + K for search is handled by scripts/search.ts.
 */
import { SHORTCUTS, type ShortcutAction } from "../lib/shortcuts";
import { goHome, openRandomPost, scrollToTop, toggleScheme } from "./actions";
import { createOverlay } from "./overlay";
import { toast } from "./toast";

export function initShortcuts(openControlCenter: () => void) {
  const sheet = document.querySelector<HTMLElement>("[data-shortcuts]");
  if (!sheet) return null;
  const help = createOverlay(sheet);

  const run: Record<ShortcutAction, () => void> = {
    search: () => {},
    scheme: () => toggleScheme(),
    controlCenter: openControlCenter,
    random: () => {
      if (!openRandomPost()) toast("还没有其他文章");
    },
    home: goHome,
    top: scrollToTop,
    help: () => help.toggle(),
  };

  document.addEventListener("keydown", (event) => {
    if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey)
      return;
    const target = event.target as Element;
    if (target.closest("input, textarea, select, [contenteditable]")) return;
    const shortcut = SHORTCUTS.find((item) => item.code === event.code);
    if (!shortcut) return;
    event.preventDefault();
    run[shortcut.action]();
  });

  return help;
}
