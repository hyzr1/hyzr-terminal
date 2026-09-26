"use client";

/**
 * SSR-safe 1 Hz clock shared across components (countdowns, ages, chart clock).
 *
 * Backed by useSyncExternalStore: the server snapshot is 0 (rendered markup
 * matches the client's first pass → no hydration mismatch), the client
 * snapshot is a cached `Date.now()` refreshed once per second. Components
 * render "--"/placeholder until it ticks past 0 after mount.
 */
import { useSyncExternalStore } from "react";

let clockNow = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const subs = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  subs.add(cb);
  if (subs.size === 1) {
    clockNow = Date.now();
    timer = setInterval(() => {
      clockNow = Date.now();
      for (const fn of subs) fn();
    }, 1000);
  }
  return () => {
    subs.delete(cb);
    if (subs.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => clockNow;
const getServerSnapshot = () => 0;

export function useClock(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
