"use client";

import { useSyncExternalStore } from "react";

export const SIDEBAR_TRANSITION_MS = 300;
export const SIDEBAR_TRANSITION_SECONDS = SIDEBAR_TRANSITION_MS / 1000;
export const SIDEBAR_TRANSITION_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";
export const SIDEBAR_TRANSITION_CURVE = [0.4, 0, 0.2, 1] as [
  number,
  number,
  number,
  number,
];
export const SIDEBAR_COMPACT_WIDTH = 80;
export const SIDEBAR_EXPANDED_WIDTH = 258;

let transitioning = false;
const listeners = new Set<() => void>();

export function setSidebarTransitioning(next: boolean) {
  if (transitioning === next) {
    return;
  }
  transitioning = next;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return transitioning;
}

function getServerSnapshot() {
  return false;
}

export function useSidebarTransitioning() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
