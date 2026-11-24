import { useEffect } from "react";
export const defaultShortcuts = {
  search: "F2",
  customers: "F3",
  discount: "F4",
  hold: "F5",
  held: "F6",
  payment: "F7",
  cash: "F8",
  calculator: "F9",
  guide: "F10",
  checkout: "Ctrl+Enter",
  print: "Ctrl+P",
  // Ctrl+N opens a browser window in Chrome/Edge before the page can intercept it.
  newSale: "Ctrl+B",
  quickSearch: "Ctrl+K",
};
export type ShortcutAction = keyof typeof defaultShortcuts;
export type ShortcutMap = Record<ShortcutAction, string>;
export const shortcutLabels: Record<ShortcutAction, string> = {
  search: "Focus scanner / product search",
  customers: "Find customer",
  discount: "Cart discount",
  hold: "Hold current cart",
  held: "Resume held cart",
  payment: "Choose payment",
  cash: "Complete cash sale",
  calculator: "Calculator",
  guide: "Shortcut guide",
  checkout: "Open checkout",
  print: "Print last receipt",
  newSale: "New sale (confirmation)",
  quickSearch: "Focus product search",
};
// Keys the browser handles itself; pages cannot reliably intercept them.
const reservedShortcuts = [
  "Ctrl+W",
  "Ctrl+T",
  "Ctrl+R",
  "Ctrl+L",
  "Ctrl+Q",
  "Ctrl+N",
];
export function validShortcuts(map: ShortcutMap): string | null {
  const values = Object.values(map);
  if (new Set(values).size !== values.length)
    return "Each shortcut must have a different key.";
  for (const key of values)
    if (
      !/^(F[1-9]|F1[0-2]|Ctrl\+(Enter|[A-Z]))$/.test(key) ||
      reservedShortcuts.includes(key)
    )
      return "Use F1–F12 or Ctrl+letter/Enter. Browser close, refresh, new window, tab and address-bar keys are reserved.";
  return null;
}
/**
 * Upgrade a saved mapping: fill actions added since it was saved and move any key that is now
 * reserved (e.g. the old Ctrl+N default) back to its current default when that key is free.
 */
export function migrateShortcuts(saved: Partial<ShortcutMap>): ShortcutMap {
  const map = { ...defaultShortcuts, ...saved } as ShortcutMap;
  for (const action of Object.keys(map) as ShortcutAction[]) {
    if (!reservedShortcuts.includes(map[action])) continue;
    const fallback = defaultShortcuts[action];
    if (!Object.values(map).includes(fallback)) map[action] = fallback;
  }
  return map;
}
export function useShortcuts(
  map: ShortcutMap,
  actions: Record<ShortcutAction, () => void>,
  blocked: boolean,
) {
  useEffect(() => {
    function handler(event: KeyboardEvent) {
      if (
        event.repeat ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        blocked
      )
        return;
      const target = event.target as HTMLElement;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable;
      if (typing && !target.hasAttribute("data-scanner")) return;
      const key =
        (event.ctrlKey ? "Ctrl+" : "") +
        (event.key.length === 1 ? event.key.toUpperCase() : event.key);
      const action = (Object.entries(map) as [ShortcutAction, string][]).find(
        ([, shortcut]) => shortcut === key,
      )?.[0];
      if (action) {
        event.preventDefault();
        actions[action]();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [map, actions, blocked]);
}
