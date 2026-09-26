"use client";
/**
 * OrderSheet (fx18) — Apple-style bottom sheet hosting the order ticket:
 * grabber handle, spring slide-up (cubic-bezier(.32,.72,0,1)), dismissed by
 * dragging the grabber down past the threshold or tapping the backdrop.
 * The sheet reuses the desktop TradePanel in "sheet" variant so desktop and
 * mobile tickets share one order pipeline (single source of truth).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import TradePanel from "./TradePanel";

const DISMISS_PX = 120;

export default function OrderSheet({
  open,
  onClose,
  armedPick,
}: {
  open: boolean;
  onClose: () => void;
  armedPick: { px: number; side?: "ask" | "bid" } | null;
}) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startYRef = useRef(0);

  /* lock page scroll while open (the shell has no page scroll, but be safe) */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overscrollBehavior;
    document.body.style.overscrollBehavior = "none";
    return () => { document.body.style.overscrollBehavior = prev; };
  }, [open]);

  /* Esc closes (parity with desktop popovers) */
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  const onGrabStart = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    startYRef.current = e.clientY;
    setDragging(true);
  }, []);
  const onGrabMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    setDragY(Math.max(0, e.clientY - startYRef.current));
  }, [dragging]);
  const onGrabEnd = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    if (dragY > DISMISS_PX) {
      setDragY(0);
      onClose();
    } else {
      setDragY(0); // springs back via the transition
    }
  }, [dragging, dragY, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label="Order ticket">
      {/* backdrop — frosted, tap to dismiss */}
      <div
        className="fade-in absolute inset-0 bg-black/45 backdrop-blur-[6px]"
        onClick={onClose}
      />

      {/* sheet */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? "none" : "transform 0.45s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        <div className="sheet-up mx-auto w-full max-w-[560px] overflow-hidden rounded-t-[20px] border-x border-t border-white/10 bg-backgroundTertiary/95 shadow-[0_-18px_60px_rgba(0,0,0,0.6)] backdrop-blur-2xl">
          {/* grabber — the whole strip drags */}
          <div
            onPointerDown={onGrabStart}
            onPointerMove={onGrabMove}
            onPointerUp={onGrabEnd}
            onPointerCancel={onGrabEnd}
            className="flex h-[38px] touch-none items-center justify-center"
            role="separator"
            aria-label="Drag down to close"
          >
            <span className="h-[4px] w-[44px] rounded-full bg-white/25" />
          </div>

          <div className="max-h-[min(72dvh,640px)] overflow-y-auto overscroll-contain px-[12px] pb-[max(20px,env(safe-area-inset-bottom))]">
            <TradePanel variant="sheet" armedPick={armedPick} />
          </div>
        </div>
      </div>
    </div>
  );
}
