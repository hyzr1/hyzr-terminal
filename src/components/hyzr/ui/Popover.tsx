"use client";

/* eslint-disable react-hooks/refs -- ref callbacks in this file are attached
   via JSX props and only run during commit; the render-prop `trigger` is a
   pure function of (open, toggle). */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type Side = "bottom" | "top";
type Align = "start" | "center" | "end";

export type PopoverTriggerProps = {
  open: boolean;
  toggle: () => void;
};

/**
 * Portal-based popover (same behaviour as the Radix popovers on the original
 * site): fixed positioning computed from the trigger rect, closes on outside
 * pointer-down / ESC / scroll, clamps itself inside the viewport.
 *
 * Positioning model: `pos` holds the RAW anchor (align/side handled purely by
 * CSS transform on the wrapper); the layout effect computes a one-way
 * `nudge` (margin-left) to keep the panel inside the viewport. All
 * measurements derive from rawRef — never from settled state — so the effect
 * can't feed back into itself.
 */
export function Popover({
  button,
  content,
  side = "bottom",
  align = "start",
  gap = 8,
  panelClassName = "",
  panelStyle,
  open: openProp,
  onOpenChange,
}: {
  button: (o: PopoverTriggerProps) => ReactNode;
  content: (close: () => void) => ReactNode;
  side?: Side;
  align?: Align;
  gap?: number;
  panelClassName?: string;
  panelStyle?: React.CSSProperties;
  /** controlled open state (optional) */
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const [openState, setOpenState] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : openState;
  const setOpen = useCallback(
    (v: boolean) => {
      if (!isControlled) setOpenState(v);
      onOpenChange?.(v);
    },
    [isControlled, onOpenChange],
  );
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [nudge, setNudge] = useState(0);
  const rawRef = useRef<{ top: number; left: number } | null>(null);
  const [rawTick, setRawTick] = useState(0);
  const [panelTick, setPanelTick] = useState(0);
  const appliedRef = useRef<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelAttached = useRef(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  /* stable ref callbacks */
  const triggerRefCb = useCallback((el: HTMLSpanElement | null) => {
    triggerRef.current = el;
  }, []);

  const panelRefCb = useCallback((el: HTMLDivElement | null) => {
    panelRef.current = el;
    if (el && !panelAttached.current) {
      panelAttached.current = true;
      setPanelTick((t) => t + 1);
    } else if (!el) {
      panelAttached.current = false;
    }
  }, []);

  const place = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    if (r.width === 0 && r.height === 0) return; // trigger hidden
    let left: number;
    if (align === "start") left = r.left;
    else if (align === "end") left = r.right;
    else left = r.left + r.width / 2;
    const top = side === "bottom" ? r.bottom + gap : r.top - gap;
    rawRef.current = { top, left };
    appliedRef.current = null;
    setPos({ top, left });
    setRawTick((t) => t + 1);
  }, [align, side, gap]);

  const openMenu = useCallback(() => {
    place();
    setOpen(true);
  }, [place, setOpen]);

  // controlled open (e.g. "Paste CA" opens search programmatically)
  useEffect(() => {
    if (isControlled && openProp) place();
  }, [isControlled, openProp, place]);

  const toggle = useCallback(() => {
    if (open) setOpen(false);
    else openMenu();
  }, [open, openMenu, setOpen]);

  // one-way viewport clamp — runs on open / re-place / panel mount only
  useLayoutEffect(() => {
    if (!open) return;
    const raw = rawRef.current;
    if (!raw) return;
    const pw = panelRef.current?.offsetWidth ?? 0;
    if (pw === 0) return;
    const margin = 8;
    const vw = window.innerWidth;

    let resolvedLeft = raw.left;
    if (align === "center") resolvedLeft -= pw / 2;
    if (align === "end") resolvedLeft -= pw;

    let delta = 0;
    if (pw < vw - margin * 2) {
      const clamped = Math.min(
        Math.max(resolvedLeft, margin),
        vw - pw - margin,
      );
      delta = clamped - resolvedLeft;
    } else {
      // panel (nearly) as wide as the viewport — pin to the left margin
      delta = Math.max(resolvedLeft, margin) - resolvedLeft;
    }

    const prev = appliedRef.current;
    if (prev && prev.top === raw.top && prev.left === delta) return;
    appliedRef.current = { top: raw.top, left: delta };
    setNudge(delta);
  }, [open, rawTick, panelTick, align, side]);

  // outside pointer-down / ESC / scroll closes
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, setOpen]);

  const transform: string[] = [];
  if (align === "center") transform.push("translateX(-50%)");
  if (align === "end") transform.push("translateX(-100%)");
  if (side === "top") transform.push("translateY(-100%)");

  return (
    <>
      {/* tight wrapper gives us the trigger's rect without render-prop refs */}
      <span ref={triggerRefCb} className="inline-flex max-w-full">
        {button({ open, toggle })}
      </span>
      {mounted && open && pos ? (
        createPortal(
          <div
            data-state="open"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              marginLeft: nudge,
              transform: transform.join(" "),
              zIndex: 100,
            }}
          >
            <div
              ref={panelRefCb}
              className={`dd-panel ${side === "top" ? "dd-top" : ""} ${panelClassName}`}
              style={panelStyle}
            >
              {content(() => setOpen(false))}
            </div>
          </div>,
          document.body,
        )
      ) : null}
    </>
  );
}
