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
  newSale: "Ctrl+N",
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
export function validShortcuts(map: ShortcutMap): string | null {
  const values = Object.values(map);
  if (new Set(values).size !== values.length)
    return "Each shortcut must have a different key.";
  for (const key of values)
    if (
      !/^(F[1-9]|F1[0-2]|Ctrl\+(Enter|[A-Z]))$/.test(key) ||
      ["Ctrl+W", "Ctrl+T", "Ctrl+R", "Ctrl+L", "Ctrl+Q"].includes(key)
    )
      return "Use F1–F12 or Ctrl+letter/Enter. Browser close, refresh, tab and address-bar keys are reserved.";
  return null;
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
