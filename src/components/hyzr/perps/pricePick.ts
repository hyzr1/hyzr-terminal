"use client";
/**
 * Price-pick channel (fx19) — shared wiring between the DOM ladder and the
 * order ticket. On mobile, tapping a ladder level dispatches a pick that
 * the terminal catches to open the order sheet pre-armed at that price.
 */
export function pickPrice(px: number, side?: "ask" | "bid") {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("perps-pick-price", { detail: { px, side } }));
  }
}

/** listen for DOM price picks — normalizes legacy number detail to {px}.
 *  Returns an unsubscribe fn (useEffect-friendly). */
export function pickPriceListen(fn: (pick: { px: number; side?: "ask" | "bid" }) => void) {
  const h = (e: Event) => {
    const d = (e as CustomEvent).detail as number | { px: number; side?: "ask" | "bid" };
    fn(typeof d === "number" ? { px: d } : d);
  };
  window.addEventListener("perps-pick-price", h);
  return () => window.removeEventListener("perps-pick-price", h);
}
