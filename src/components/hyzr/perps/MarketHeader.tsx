"use client";
/**
 * Market header (64px) — coin selector, mark price + 24h change,
 * Oracle Price / 24h Volume / Open Interest / Funding-Countdown stats.
 * Classes mirror the reference DOM 1:1.
 */
import { usePerpsData } from "@/lib/hyperliquid/perpsStore";
import { baseName } from "@/lib/hyperliquid/types";
import { fmtPrice, fmtUsd, fmtFunding, fmtCountdown, nextFundingTime } from "@/lib/hyperliquid/format";
import HlIcon from "./HlIcon";
import { useClock } from "@/hooks/use-clock";

export default function MarketHeader({ onOpenSelector }: { onOpenSelector: () => void }) {
  const coin = usePerpsData((s) => s.coin);
  const byName = usePerpsData((s) => s.byName);
  const mids = usePerpsData((s) => s.mids);
  const meta = byName[coin]?.meta;
  const ctx = byName[coin]?.ctx;
  const mid = mids[coin] ?? (ctx ? +ctx.midPx : null);

  /* SSR-safe clock: useSyncExternalStore-based (no hydration mismatch) */
  const now = useClock();

  const prevDay = ctx ? +ctx.prevDayPx : null;
  const change = mid != null && prevDay ? ((mid - prevDay) / prevDay) * 100 : null;
  const mark = ctx ? +ctx.markPx : mid;
  const oracle = ctx ? +ctx.oraclePx : null;
  const vol = ctx ? +ctx.dayNtlVlm : null;
  const oi = ctx ? +ctx.openInterest : null;
  const oiUsd = oi != null && mark ? oi * mark : null;
  const funding = ctx ? +ctx.funding : null;
  const countdown = now ? fmtCountdown(nextFundingTime(now) - now) : "--";

  return (
    <>
      {/* mobile header (172px) */}
      <div className="flex h-[172px] w-full flex-col py-[12px] sm:hidden">
        <div className="flex w-full flex-1 flex-col items-center justify-start gap-[16px]">
          <div className="group/row flex w-full flex-row items-center justify-start gap-[16px] px-[16px]">
            <div className="flex w-full flex-row items-center justify-start gap-[16px]">
              <div className="flex flex-1 flex-row items-center justify-between gap-[16px]">
                <button onClick={onOpenSelector} className="group flex items-center gap-[8px]">
                  <span className="text-[18px] font-medium leading-[23px] tracking-[-0.02em] text-textPrimary">{coin}</span>
                  <i className="ri-arrow-down-s-line text-[20px] text-textSecondary transition-transform duration-150 group-hover:text-textPrimary" />
                </button>
                <div className="flex flex-row items-center justify-center gap-[16px]">
                  <div className="flex flex-row items-baseline justify-start gap-[8px]">
                    <span className={`text-[12px] font-normal leading-[16px] ${change != null && change < 0 ? "text-decrease" : "text-increase"}`}>
                      {change != null ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "--"}
                    </span>
                    <span className="text-[18px] font-medium leading-[23px] text-textPrimary [font-variant-numeric:tabular-nums]">
                      {fmtPrice(meta, mark)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="w-full max-h-[120px] overflow-hidden opacity-100">
            <div className="flex flex-col gap-[16px]">
              <div className="flex w-full flex-row items-center justify-start gap-[16px] px-[12px]">
                <Stat label="Mark Price" value={fmtPrice(meta, mark)} />
                <Stat label="Oracle Price" value={fmtPrice(meta, oracle)} />
                <Stat label="24h Volume" value={fmtUsd(vol)} />
              </div>
              <div className="flex w-full flex-row items-center justify-start gap-[16px] px-[12px]">
                <Stat label="Open Interest" value={fmtUsd(oiUsd)} />
                <Stat
                  label="Funding"
                  value={fmtFunding(funding)}
                  valueClass={funding != null && funding < 0 ? "text-decrease" : "text-increase"}
                />
                <Stat label="Countdown" value={countdown} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* desktop header (64px) */}
      <div className="hidden max-h-[64px] min-h-[64px] flex-1 flex-row items-center justify-start gap-[16px] border-b border-primaryStroke px-[16px] sm:flex">
        <div className="flex flex-row items-center justify-start gap-[8px]">
          <button onClick={onOpenSelector} className="group flex items-center gap-[8px]">
            <HlIcon coin={coin} size={30} />
            <span className="text-[18px] font-medium leading-[23px] tracking-[-0.02em] text-textPrimary">{baseName(coin)}</span>
            <i className="ri-arrow-down-s-line text-[20px] text-textSecondary transition-transform duration-150 group-hover:text-textPrimary" />
          </button>
        </div>

        <div className="flex flex-col items-start justify-start gap-[2px] px-[4px]">
          <div className="flex flex-row items-center gap-[4px]">
            <span className="w-full text-[18px] font-medium leading-[23px] tracking-[-0.02em] text-textPrimary [font-variant-numeric:tabular-nums]">
              {fmtPrice(meta, mark)}
            </span>
            <span className={`text-[12px] font-normal leading-[16px] ${change != null && change < 0 ? "text-decrease" : "text-increase"}`}>
              {change != null ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "--"}
            </span>
          </div>
        </div>

        <Stat label="Oracle Price" value={fmtPrice(meta, oracle)} />
        <Stat label="24h Volume" value={fmtUsd(vol)} />
        <Stat label="Open Interest" value={fmtUsd(oiUsd)} />

        <div className="flex flex-col items-start justify-start gap-[2px] px-[4px]">
          <span className="text-[11px] font-normal leading-[16px] tracking-[-0.01em] text-textTertiary">
            Funding / Countdown
          </span>
          <div className="flex flex-row items-center gap-[4px]">
            <span className="w-full text-[13px] font-medium leading-[18px] text-textPrimary [font-variant-numeric:tabular-nums]">
              <span className="flex flex-row items-center justify-start gap-[8px]">
                <span className={funding != null && funding < 0 ? "text-decrease" : "text-increase"}>
                  {fmtFunding(funding)}
                </span>
                <span className="font-normal leading-[16px] text-textPrimary [font-variant-numeric:tabular-nums]">
                  {countdown}
                </span>
              </span>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex flex-col items-start justify-start gap-[2px] px-[4px]">
      <span className="text-[11px] font-normal leading-[16px] tracking-[-0.01em] text-textTertiary sm:text-[12px] sm:text-textSecondary">{label}</span>
      <div className="flex flex-row items-center gap-[4px]">
        <span className={`w-full text-[14px] font-medium leading-[18px] text-textPrimary [font-variant-numeric:tabular-nums] sm:text-[13px] sm:font-normal sm:leading-[17px] ${valueClass ?? ""}`}>
          {value}
        </span>
      </div>
    </div>
  );
}
