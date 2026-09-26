"use client";

/* The thin 28px strip under the navbar: quick-toggle icons + LIVE ticker.
   Modes: All / Gainers / Losers; star = favorites only; chart = SOL chart
   popover; history = recently viewed tokens (localStorage). */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLive } from "./live/LiveProvider";
import { Popover } from "./ui/Popover";
import { SolPricePopoverContent } from "./menus/SolPricePopover";
import InlineTokenIcon from "./InlineTokenIcon";
import { toast } from "@/lib/hyperliquid/tradeStore";

type TickerMode = "all" | "gainers" | "losers";

const LS_RECENT = "hyzr-recent-tokens";
const ICONS: Record<string, string> = {
  BTC: "/icons/hl/BTC.svg",
  ETH: "/icons/hl/ETH.svg",
  SOL: "/icons/hl/SOL.svg",
  HYPE: "/icons/hl/HYPE.svg",
};

function TickerItem({
  sym,
  price,
  chg,
  icon,
  onClick,
}: {
  sym: string;
  price: string;
  chg: number | null;
  icon?: string;
  onClick?: () => void;
}) {
  const up = (chg ?? 0) >= 0;
  const src = ICONS[sym] ?? icon ?? null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[20px] flex-shrink-0 flex-row items-center gap-[5px] rounded-[4px] px-[6px] transition-colors hover:bg-primaryStroke/50"
    >
      {src ? (
        <InlineTokenIcon src={src} symbol={sym} size={12} />
      ) : (
        <span className="h-[12px] w-[12px] rounded-full bg-primaryStroke/70 text-center text-[8px] leading-[12px] text-textSecondary">
          {sym[0]}
        </span>
      )}
      <span className="text-[11px] font-medium text-textSecondary">{sym}</span>
      <span className="font-GeistMono text-[11px] text-textSecondary">{price}</span>
      {chg != null ? (
        <span
          className={`font-GeistMono text-[11px] ${up ? "text-increase" : "text-decrease"}`}
        >
          {up ? "+" : ""}
          {chg.toFixed(2)}%
        </span>
      ) : null}
    </button>
  );
}

export default function TickerBar() {
  const { tokens } = useLive();
  const router = useRouter();
  const [mode, setMode] = useState<TickerMode>("all");
  const [favsOnly, setFavsOnly] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const favs = useMemo(() => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      return new Set(JSON.parse(localStorage.getItem("hyzr-starred") ?? "[]"));
    } catch {
      return new Set<string>();
    }
  }, [favsOnly]); // refresh when the toggle flips

  const rows = useMemo(() => {
    let list = tokens.filter((t) => !!t.symbol && t.price > 0);
    if (favsOnly && favs.size > 0) list = list.filter((t) => favs.has(t.symbol));
    if (mode === "gainers")
      list = [...list].sort((a, b) => b.ch24h - a.ch24h).slice(0, 14);
    else if (mode === "losers")
      list = [...list].sort((a, b) => a.ch24h - b.ch24h).slice(0, 14);
    else list = list.slice(0, 22);
    return list;
  }, [tokens, mode, favsOnly, favs]);

  const recents = useMemo(() => {
    if (typeof window === "undefined") return [];
    try {
      return (JSON.parse(localStorage.getItem(LS_RECENT) ?? "[]") as string[]).slice(0, 10);
    } catch {
      return [];
    }
  }, [showHistory]);

  const modeLabel = mode === "all" ? "All" : mode === "gainers" ? "Gainers" : "Losers";

  return (
    <div className="hidden sm:block">
      <div className="relative flex h-[28px] w-full flex-row gap-[8px] overflow-hidden border-b border-primaryStroke px-[16px] pb-[1px] opacity-[0.85] transition-opacity duration-150 ease-out hover:opacity-100 sm:border-primaryStroke/50">
        {/* left controls */}
        <div className="z-20 flex h-full flex-row items-center gap-[8px]">
          <button
            type="button"
            title={`Ticker filter: ${modeLabel}`}
            onClick={() => {
              const next: TickerMode = mode === "all" ? "gainers" : mode === "gainers" ? "losers" : "all";
              setMode(next);
              toast(`Ticker: ${next === "all" ? "All markets" : next === "gainers" ? "Top gainers" : "Top losers"}`, "info");
            }}
            className="flex min-h-[24px] min-w-[24px] items-center justify-center rounded-[4px] text-textTertiary transition-colors duration-fast ease-in-out hover:bg-primaryStroke/60 hover:text-textSecondary"
          >
            <i className="ri-settings-3-line text-[14px]" />
          </button>
        </div>
        <div className="z-20 flex h-full flex-row items-center gap-[8px]">
          <div className="h-[16px] w-[1px] bg-primaryStroke" />
        </div>
        <div className="z-20 flex h-full flex-row items-center gap-[3px]">
          <button
            type="button"
            title="Favorites only"
            onClick={() => setFavsOnly((v) => !v)}
            className={`flex min-h-[24px] min-w-[24px] items-center justify-center rounded-[4px] transition-colors duration-fast ease-in-out hover:bg-primaryStroke/60 ${
              favsOnly ? "text-primaryBlue" : "text-textSecondary hover:text-textSecondary"
            }`}
          >
            <i className={`${favsOnly ? "ri-star-fill" : "ri-star-line"} text-[14px]`} />
          </button>
          <Popover
            side="bottom"
            align="start"
            gap={6}
            content={() => <SolPricePopoverContent close={() => {}} />}
            button={({ toggle }) => (
              <button
                type="button"
                title="SOL price chart"
                onClick={toggle}
                className="flex min-h-[24px] min-w-[24px] items-center justify-center rounded-[4px] text-textTertiary transition-colors duration-fast ease-in-out hover:bg-primaryStroke/60 hover:text-textSecondary"
              >
                <i className="ri-line-chart-line text-[14px]" />
              </button>
            )}
          />
          <Popover
            side="bottom"
            align="start"
            gap={6}
            content={() =>
              recents.length > 0 ? (
                <div className="w-[220px] rounded-[12px] border border-primaryStroke bg-backgroundTertiary p-[8px] shadow-[0_16px_48px_rgba(0,0,0,0.55)]">
                  <p className="px-[4px] pb-[6px] text-[11px] font-semibold uppercase tracking-wider text-textTertiary">
                    Recently viewed
                  </p>
                  {recents.map((r) => (
                    <div key={r} className="flex h-[28px] items-center rounded-[6px] px-[6px] text-[12px] text-textSecondary hover:bg-primaryStroke/40">
                      <i className="ri-history-line mr-[6px] text-[13px] text-textTertiary" />
                      {r}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="w-[200px] rounded-[12px] border border-primaryStroke bg-backgroundTertiary p-[12px] text-[12px] text-textTertiary shadow-[0_16px_48px_rgba(0,0,0,0.55)]">
                  No recently viewed tokens yet — open one from the table.
                </div>
              )
            }
            button={({ toggle }) => (
              <button
                type="button"
                title="Recently viewed"
                onClick={() => {
                  setShowHistory(true);
                  toggle();
                }}
                className="flex min-h-[24px] min-w-[24px] items-center justify-center rounded-[4px] text-textTertiary transition-colors duration-fast ease-in-out hover:bg-primaryStroke/60 hover:text-textSecondary"
              >
                <i className="ri-history-line text-[14px]" />
              </button>
            )}
          />
        </div>
        <div className="z-20 flex h-full flex-row items-center gap-[8px]">
          <div className="h-[16px] w-[1px] bg-primaryStroke" />
        </div>

        {/* ticker viewport */}
        <section
          aria-label="Ticker list"
          className="group/ticker relative flex flex-1 flex-row items-center justify-start overflow-hidden"
        >
          <div className="no-scrollbar flex h-full flex-row items-center gap-[1px] overflow-x-auto pt-[1px]">
            {rows.map((t) => (
              <TickerItem
                key={t.id}
                sym={t.symbol}
                icon={t.image}
                price={
                  t.price >= 1000
                    ? `$${(t.price / 1000).toFixed(1)}K`
                    : `$${t.price < 1 ? t.price.toFixed(4) : t.price.toFixed(2)}`
                }
                chg={t.ch24h ?? null}
                onClick={() => {
                  try {
                    const recent = JSON.parse(localStorage.getItem(LS_RECENT) ?? "[]");
                    const next = [t.symbol, ...recent.filter((s: string) => s !== t.symbol)].slice(0, 12);
                    localStorage.setItem(LS_RECENT, JSON.stringify(next));
                  } catch { /* ignore */ }
                  /* every ticker opens its perps chart (deep link resolves
                     display aliases SPX->xyz:SP500, OIL->CL, ...) */
                  router.push(`/trade?market=${encodeURIComponent(t.tradeCoin ?? t.symbol)}`);
                }}
              />
            ))}
            {rows.length === 0 ? (
              <span className="px-[8px] text-[11px] text-textTertiary">
                {favsOnly ? "No favorites yet — star tokens to pin them here" : "Loading live prices…"}
              </span>
            ) : null}
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-[40px] bg-gradient-to-l from-background to-transparent" />
          {/* current filter chip */}
          <span className="z-10 ml-[4px] hidden items-center rounded-full bg-primaryStroke/50 px-[6px] py-[1px] text-[10px] font-semibold text-textSecondary md:flex">
            {modeLabel}
            {favsOnly ? " · ★" : ""}
          </span>
        </section>
      </div>
    </div>
  );
}
