"use client";
/**
 * Perpetuals page shell — the Trade Lab.
 *
 * fx19 structural model (TopstepX/ProjectX panel workspace):
 *  - desktop (≥lg): a WORKSPACE of independent bordered panels — Chart, DOM
 *    price ladder, Order Panel, Positions, Orders, Trades, Time & Sales,
 *    Account. Every panel drags by its header, resizes by its edges, links
 *    to a market group by color, and can be closed; "+ Add Component"
 *    inserts new ones; arrangements persist (named layouts + auto-save).
 *  - mobile/tablet (<lg): a DEDICATED structure (MobileTerminal) — the
 *    dock "Trade" button lands on the DOM/order-entry view with the P&L
 *    header; bottom tab bar + three-dot overflow; NOT a reflow of desktop.
 *
 * Live data: Hyperliquid WS (allMids / l2Book / trades / candle /
 * activeAssetCtx) — per-market feeds driven by the panel watchlist.
 */
import { Suspense, useEffect, useLayoutEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePerpsStreams } from "./usePerpsStreams";
import PerpsTicker from "./PerpsTicker";
import MarketSelector from "./MarketSelector";
import SettingsModal from "./SettingsModal";
import MobileTerminal from "./MobileTerminal";
import WorkspaceBar from "./workspace/WorkspaceBar";
import WorkspaceHost from "./workspace/WorkspaceHost";

/** matchMedia hook — true at ≥lg (1024px). useLayoutEffect corrects the
 *  SSR default before first paint (no wrong-structure flash on phones). */
function useIsDesktop() {
  const [ok, setOk] = useState(true);
  const useIso = typeof window !== "undefined" ? useLayoutEffect : useEffect;
  useIso(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setOk(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return ok;
}

/** Deep link: /trade?market=BTC | xyz:SP500 | SPX — resolves against the
 *  loaded universe (display symbols included) once meta arrives. */
function useWireMarketParam() {
  const params = useSearchParams();
  const raw = params?.get("market") ?? null;
  useEffect(() => {
    if (!raw) return;
    let stopped = false;
    (async () => {
      const wanted = decodeURIComponent(raw).trim();
      if (!wanted) return;
      // display-symbol aliases -> HL universe names
      const ALIAS: Record<string, string> = {
        SPX: "SP500",
        NDX: "XYZ100",
        BRENT: "BRENTOIL",
        PLAT: "PLATINUM",
        ALUM: "ALUMINIUM",
        OIL: "CL",
      };
      const resolved = ALIAS[wanted.toUpperCase()] ?? wanted;
      const wUpper = resolved.toUpperCase();
      // universe may take a while on first load (upstream rate-limit backoff)
      for (let i = 0; i < 90 && !stopped; i++) {
        const { usePerpsData } = await import("@/lib/hyperliquid/perpsStore");
        const st = usePerpsData.getState();
        if (st.loaded && st.universe.length > 0) {
          const byExact = st.universe.find(
            (m) =>
              m.meta.name === resolved ||
              m.meta.name.replace(/^xyz:/, "").toUpperCase() === wUpper,
          )?.meta.name;
          if (byExact) st.setCoin(byExact);
          return;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    })();
    return () => {
      stopped = true;
    };
  }, [raw]);
}

interface ToastItem {
  id: number;
  msg: string;
  kind: "success" | "error" | "info";
}

function PerpsInner() {
  usePerpsStreams();
  useWireMarketParam();

  const isDesktop = useIsDesktop();

  return (
    <div className="perps-root flex h-full min-h-0 w-full flex-col bg-backgroundSecondary">
      <PerpsTicker />

      {isDesktop ? (
        /* ============ DESKTOP — TopstepX-style panel workspace ============ */
        <div className="flex min-h-[0px] flex-1 flex-col overflow-hidden">
          <WorkspaceBar />
          <WorkspaceHost />
        </div>
      ) : (
        /* ========= MOBILE / TABLET — dedicated structure (fx18/fx19) ======= */
        <MobileTerminal />
      )}

      <SettingsModal />
      <Toasts />
    </div>
  );
}

/* ------------------------------- toasts -------------------------------- */

function Toasts() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    let id = 0;
    const h = (e: Event) => {
      const { msg, kind } = (e as CustomEvent).detail as { msg: string; kind: ToastItem["kind"] };
      const item = { id: ++id, msg, kind };
      setItems((prev) => [...prev.slice(-3), item]);
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== item.id)), 3500);
    };
    window.addEventListener("hyzr-toast", h);
    return () => window.removeEventListener("hyzr-toast", h);
  }, []);

  return (
    /* mobile: clear of the module tab bar (dock 48 + tab bar ~56) · desktop:
       clear of the floating dock pill */
    <div className="pointer-events-none fixed bottom-[116px] right-[12px] z-[120] flex flex-col gap-[8px] lg:bottom-[52px] lg:right-[12px]">
      {items.map((t) => (
        <div
          key={t.id}
          className="glass-pop-strong pointer-events-auto flex items-center gap-[8px] rounded-[10px] border border-secondaryStroke px-[12px] py-[8px] shadow-dropdown pop-in"
        >
          <span
            className={`h-[8px] w-[8px] rounded-full ${
              t.kind === "success" ? "bg-increase" : t.kind === "error" ? "bg-decrease" : "bg-primaryBlue"
            }`}
          />
          <span className="max-w-[360px] text-[12px] text-textPrimary">{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

/** Suspense boundary required by useSearchParams during static prerender. */
export default function PerpsPage() {
  return (
    <Suspense fallback={null}>
      <PerpsInner />
    </Suspense>
  );
}
