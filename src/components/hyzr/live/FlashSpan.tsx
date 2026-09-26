"use client";

/* ---------------------------------------------------------------------------
 * FlashSpan — green/red cell flash when a live value moves.
 * Implemented without setState: direction is derived during render from a
 * previous-value ref and latched briefly so unrelated re-renders don't cut
 * the animation. `key` remounts the span on each value change so the CSS
 * animation restarts.
 * ------------------------------------------------------------------------- */

import { useRef, type ReactNode } from "react";

const LATCH_MS = 700;

export default function FlashSpan({
  value,
  children,
  className = "",
}: {
  value: number;
  children: ReactNode;
  className?: string;
}) {
  const prev = useRef(value);
  const latch = useRef<{ dir: "up" | "down"; at: number } | null>(null);

  let dir: "up" | "down" | null = null;
  const p = prev.current;
  if (isFinite(value) && isFinite(p) && p !== 0 && value !== p) {
    const change = Math.abs((value - p) / p);
    if (change >= 0.0005) {
      dir = value > p ? "up" : "down";
      latch.current = { dir, at: Date.now() };
    }
  } else if (latch.current && Date.now() - latch.current.at < LATCH_MS) {
    dir = latch.current.dir;
  }
  prev.current = value;

  const cls = dir ? (dir === "up" ? "flash-up" : "flash-down") : "";

  return (
    <span key={value} className={`${className} ${cls}`.trim()}>
      {children}
    </span>
  );
}
