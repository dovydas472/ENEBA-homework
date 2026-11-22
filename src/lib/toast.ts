// A tiny toast store (DESIGN.md 4.11): any code can call showToast(), the <Toaster /> in the layout shows it.
// Same pattern as the cart store: a value outside React + useSyncExternalStore. Only ONE toast is shown
// at a time - a new one replaces the old one (adding three items quickly shows one message, not a pile).
import { useSyncExternalStore } from "react";

export interface ToastAction {
  label: string;
  /** In-app path, e.g. "/cart" (rendered as a router link). */
  to: string;
}

export interface Toast {
  /** New for every showToast call, so the same text shown twice restarts its timer. */
  id: number;
  /** success = mint bar, info = yellow bar (the type is also written in the text, not only coloured). */
  kind: "success" | "info";
  message: string;
  action?: ToastAction;
}

let current: Toast | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/** Shows a toast (replacing the one on screen) and returns its id. */
export function showToast(toast: Omit<Toast, "id">): number {
  current = { ...toast, id: nextId++ };
  notify();
  return current.id;
}

/** Hides the toast with this id (does nothing if another toast replaced it meanwhile). */
export function dismissToast(id: number) {
  if (current?.id !== id) return;
  current = null;
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The toast on screen, or null. */
export function useToast(): Toast | null {
  return useSyncExternalStore(subscribe, () => current);
}
