"use client";
/**
 * 28px perps ticker — 1:1 with the real DOM:
 *   [28px strip bg-backgroundSecondary]
 *     [overflow-hidden grayscale-[30%] hover:grayscale-0]
 *       [ticker-scroll-container flex-1 overflow-x-auto]
 *         [16px spacer][animate-ticker flex gap-1px: BTC · ETH · SOL][16px spacer]
 * Items: h-24 min-w-116, 15px icon, 12px font-medium symbol + colored change.
 * Click = switch market. Marquee only scrolls when content overflows.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { usePerpsData } from "@/lib/hyperliquid/perpsStore";
import { baseName } from "@/lib/hyperliquid/types";
import HlIcon from "./HlIcon";

const FLAGSHIP = ["BTC", "ETH", "SOL"];

export default function PerpsTicker() {
  const universe = usePerpsData((s) => s.universe);
  const mids = usePerpsData((s) => s.mids);
  const coin = usePerpsData((s) => s.coin);
  const setCoin = usePerpsData((s) => s.setCoin);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  const items = useMemo(() => {
    // flagship BTC/ETH/SOL only — exactly like the real strip
    const rows = universe
      .filter((m) => m.ctx && (mids[m.meta.name] || +m.ctx.midPx))
      .map((m) => {
        const mid = mids[m.meta.name] ?? +m.ctx!.midPx;
        const prev = +m.ctx!.prevDayPx;
        const change = prev ? ((mid - prev) / prev) * 100 : 0;
        return { name: m.meta.name, change };
      });
    return FLAGSHIP
      .map((f) => rows.find((r) => baseName(r.name) === f))
      .filter((r): r is (typeof rows)[number] => !!r);
  }, [universe, mids]);

  // marquee only when the 3 majors overflow the strip (narrow viewports)
  useEffect(() => {
    const check = () => {
      const c = contentRef.current;
      const s = scrollRef.current;
      if (c && s) setOverflows(c.scrollWidth > s.clientWidth + 4);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [items]);

  if (items.length === 0) {
    return <div className="flex h-[28px] max-h-[28px] min-h-[28px] w-full border-b border-primaryStroke bg-backgroundSecondary" />;
  }

  return (
    <div className="flex h-[28px] max-h-[28px] min-h-[28px] max-lg:h-[44px] max-lg:max-h-[44px] max-lg:min-h-[44px] w-full flex-row items-center justify-start gap-[16px] border-b border-primaryStroke bg-backgroundSecondary">
      <div className="relative flex h-[28px] w-full flex-row overflow-hidden grayscale-[30%] transition-[filter] duration-150 ease-in-out [-ms-overflow-style:none] [scrollbar-width:none] hover:grayscale-0 [&::-webkit-scrollbar]:hidden">
        <div ref={scrollRef} className="ticker-scroll-container flex flex-1 flex-row items-center justify-start overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="w-[16px] shrink-0" />
          <div
            ref={contentRef}
            className={`flex flex-row items-center gap-[1px] ${overflows ? "animate-ticker" : ""}`}
          >
            {items.map((it) => {
              const base = baseName(it.name);
              return (
                <button
                  key={it.name}
                  type="button"
                  onClick={() => setCoin(it.name)}
                  className="duration-135 flex h-[24px] max-lg:h-[40px] max-lg:my-[1px] min-w-[116px] flex-row items-center justify-center gap-[4px] rounded p-1 px-[4px] transition-all ease-in-out hover:rounded-[4px] hover:bg-primaryStroke/40"
                >
                  <div className="flex flex-row items-center justify-start gap-[4px]">
                    <HlIcon coin={it.name} size={15} className="rounded-full" />
                    <span className={`text-[12px] font-medium leading-[16px] ${it.name === coin ? "text-textPrimary" : "text-textSecondary"}`}>
                      {base}
                    </span>
                  </div>
                  <span className={`text-[12px] font-medium leading-[16px] ${it.change < 0 ? "text-decrease" : "text-increase"}`}>
                    {it.change >= 0 ? "+" : ""}{it.change.toFixed(2)}%
                  </span>
                </button>
              );
            })}
          </div>
          <div className="w-[16px] shrink-0" />
        </div>
      </div>
    </div>
  );
}
