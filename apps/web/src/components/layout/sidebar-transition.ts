"use client";

import { useSyncExternalStore } from "react";

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
