"use client";
/**
 * Market selector modal (800×320) — search + all Hyperliquid perp markets:
 * Token (star, name, max-leverage badge) | Last Price | 24h Change |
 * 8h Funding | 24h Volume | Open Interest. 1:1 with the reference.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { usePerpsData } from "@/lib/hyperliquid/perpsStore";
import { fmtPrice, fmtPct, fmtUsd } from "@/lib/hyperliquid/format";
import { baseName } from "@/lib/hyperliquid/types";
import HlIcon from "./HlIcon";

export default function MarketSelector({
  onClose,
  /** fx19 panel model: pick target — defaults to the primary store coin.
   *  Panel-scoped symbol buttons pass their own setter here. */
  onPick,
}: {
  onClose: () => void;
  onPick?: (coin: string) => void;
}) {
  const universe = usePerpsData((s) => s.universe);
  const mids = usePerpsData((s) => s.mids);
  const coin = usePerpsData((s) => s.coin);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const rows = useMemo(() => {
    const query = q.trim().toUpperCase();
    return universe
      .map((m) => {
        const ctx = m.ctx;
        const mid = mids[m.meta.name] ?? (ctx ? +ctx.midPx : null);
        const prev = ctx ? +ctx.prevDayPx : null;
        const change = mid != null && prev ? ((mid - prev) / prev) * 100 : null;
        const changeAbs = mid != null && prev ? mid - prev : null;
        return {
          name: m.meta.name,
          base: baseName(m.meta.name),
          dex: m.meta.dex ?? null,
          maxLev: m.meta.maxLeverage,
          mid,
          change,
          changeAbs,
          funding: ctx ? +ctx.funding : null,
          vol: ctx ? +ctx.dayNtlVlm : null,
          oi: ctx ? +ctx.openInterest : null,
          mark: ctx ? +ctx.markPx : null,
        };
      })
      .filter((r) => !query || r.base.includes(query) || r.name.includes(query) || (r.dex && query === r.dex.toUpperCase()))
      .sort((a, b) => (b.vol ?? 0) - (a.vol ?? 0));
  }, [universe, mids, q]);

  return (
    <div className="fade-in fixed inset-0 z-[80] bg-black/50 backdrop-blur-[8px]" onMouseDown={onClose}>
      <div
        className="glass-pop-strong pop-in absolute left-1/2 top-[max(64px,8dvh)] flex h-[min(320px,64dvh)] w-[min(800px,calc(100vw-16px))] -translate-x-1/2 flex-col gap-[16px] overflow-hidden rounded-[14px] border border-white/10 pt-[16px] shadow-dropdown"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex w-full flex-row items-center justify-start gap-[16px] px-[16px]">
          <div className="flex h-[32px] flex-1 flex-row items-center justify-start gap-[8px] rounded-[8px] border border-secondaryStroke pl-[12px] pr-[12px]">
            <i className="ri-search-2-line text-[16px] text-textSecondary" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search markets"
              className="w-full bg-transparent text-[12px] font-normal leading-[16px] text-textPrimary outline-none placeholder:text-textTertiary"
            />
          </div>
        </div>

        {/* header row */}
        <div className="flex max-h-[32px] min-h-[32px] w-full flex-row items-center justify-start gap-[8px] border-t border-secondaryStroke px-[16px] pt-[6px]">
          <div className="flex min-w-[160px] flex-[0.8] flex-row items-center justify-start gap-[8px]">
            <span className="text-[12px] font-normal leading-[16px] text-textTertiary">Token</span>
          </div>
          <div className="flex flex-[0.8] flex-row items-center justify-start gap-[8px]">
            <span className="text-[12px] font-normal leading-[16px] text-textTertiary">Last Price</span>
          </div>
          <div className="flex flex-[1.2] flex-row items-center justify-start gap-[8px]">
            <span className="text-[12px] font-normal leading-[16px] text-textTertiary">24h Change</span>
          </div>
          <div className="flex flex-1 flex-row items-center justify-start gap-[8px]">
            <span className="text-[12px] font-normal leading-[16px] text-textTertiary">8h Funding</span>
          </div>
          <div className="flex flex-1 flex-row items-center justify-start gap-[8px]">
            <span className="text-[12px] font-normal leading-[16px] text-textTertiary">24h Volume</span>
          </div>
          <div className="flex flex-1 flex-row items-center justify-start gap-[8px]">
            <span className="text-[12px] font-normal leading-[16px] text-textTertiary">Open Interest</span>
          </div>
        </div>

        {/* rows */}
        <div className="h-full w-full flex-col overflow-y-auto pb-[16px] [scrollbar-gutter:stable]">
          {rows.map((r) => (
            <div
              key={r.name}
              onClick={() => {
                if (onPick) onPick(r.name);
                else usePerpsData.getState().setCoin(r.name);
                onClose();
              }}
              className={`flex max-h-[44px] min-h-[44px] w-full cursor-pointer flex-row items-center justify-start gap-[8px] border-b border-primaryStroke/30 px-[16px] hover:bg-primaryStroke/30 ${
                r.name === coin ? "bg-primaryStroke/30" : ""
              }`}
            >
              <div className="flex min-w-[160px] flex-[0.8] flex-row items-center justify-start gap-[8px] overflow-hidden">
                <HlIcon coin={r.name} size={22} />
                <div className="flex min-w-0 flex-row items-center justify-start gap-[4px]">
                  <span className="truncate text-[12px] font-medium leading-[16px] text-textPrimary">{r.base}</span>
                  {r.dex && (
                    <span className="shrink-0 rounded-[3px] bg-secondaryStroke/40 px-[3px] py-[1px] text-[9px] font-medium uppercase leading-[12px] text-textTertiary">
                      {r.dex}
                    </span>
                  )}
                </div>
                <div className="flex h-[18px] shrink-0 flex-row items-center justify-start gap-[4px] rounded-[4px] bg-secondaryStroke/50 p-[4px]">
                  <span className="text-[11px] font-medium leading-[14px] text-textSecondary">{r.maxLev}x</span>
                </div>
              </div>
              <div className="flex flex-[0.8] flex-row items-center justify-start gap-[8px]">
                <span className="text-[12px] font-normal leading-[16px] text-textSecondary">{fmtPrice(undefined, r.mid)}</span>
              </div>
              <div className="flex flex-[1.2] flex-row items-center justify-start gap-[8px]">
                <span className={`text-[12px] font-medium leading-[16px] ${r.change != null && r.change < 0 ? "text-decrease" : "text-increase"}`}>
                  {r.change != null ? `${r.changeAbs! >= 0 ? "+" : ""}${fmtPrice(undefined, r.changeAbs)} / ${fmtPct(r.change)}` : "--"}
                </span>
              </div>
              <div className="flex flex-1 flex-row items-center justify-start gap-[8px]">
                <span className={`text-[12px] font-normal leading-[16px] ${r.funding != null && r.funding < 0 ? "text-decrease" : "text-textSecondary"}`}>
                  {r.funding != null ? `${(r.funding * 100).toFixed(4)}%` : "--"}
                </span>
              </div>
              <div className="flex flex-1 flex-row items-center justify-start gap-[8px]">
                <span className="text-[12px] font-normal leading-[16px] text-textSecondary">{fmtUsd(r.vol)}</span>
              </div>
              <div className="flex flex-1 flex-row items-center justify-start gap-[8px]">
                <span className="text-[12px] font-normal leading-[16px] text-textSecondary">
                  {r.oi != null && r.mark ? fmtUsd(r.oi * r.mark) : "--"}
                </span>
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="flex h-[100px] items-center justify-center text-[13px] text-textSecondary">No markets found</div>
          )}
        </div>
      </div>
    </div>
  );
}
