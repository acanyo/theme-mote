/**
 * Keyboard shortcuts, shared by the help sheet (Shortcuts.astro) and the
 * key handler (scripts/shortcuts.ts). `key` is matched against
 * KeyboardEvent.code with Shift held, except for search (Ctrl/Cmd + K).
 */
export type ShortcutAction =
  | "search"
  | "scheme"
  | "controlCenter"
  | "random"
  | "home"
  | "top"
  | "help";

export interface Shortcut {
  action: ShortcutAction;
  label: string;
  keys: string[];
  code?: string;
}

export const SHORTCUTS: Shortcut[] = [
  { action: "search", label: "站内搜索", keys: ["⌘/Ctrl", "K"] },
  { action: "scheme", label: "切换明暗", keys: ["Shift", "D"], code: "KeyD" },
  {
    action: "controlCenter",
    label: "打开阅读偏好",
    keys: ["Shift", "A"],
    code: "KeyA",
  },
  { action: "random", label: "随机文章", keys: ["Shift", "R"], code: "KeyR" },
  { action: "home", label: "返回首页", keys: ["Shift", "H"], code: "KeyH" },
  { action: "top", label: "回到顶部", keys: ["Shift", "T"], code: "KeyT" },
  { action: "help", label: "显示快捷键", keys: ["Shift", "?"], code: "Slash" },
];
