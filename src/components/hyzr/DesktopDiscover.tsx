"use client";

import { useMemo, useState } from "react";
import { TimeframeTabs, WalletSelect, QuickBuyInput } from "./controls";
import { Popover } from "./ui/Popover";
import {
  SurgeMenuContent,
  SettingsMenuContent,
  TimerMenuContent,
} from "./menus/SmallMenus";
import {
  useHyzrUI,
  type SurgeSource,
} from "./ui/HyzrUI";
import { useLive } from "./live/LiveProvider";
import { buildRow, dispSeries, tfCh, tfVol, type Timeframe } from "./live/toRow";
import {
  rankTrending,
  topEligible,
  trendScore,
} from "./live/trend";
import type { LiveToken } from "@/lib/hyzr-live-types";
import DiscoverTable from "./DiscoverTable";
import SurgeBoard, { type SurgeColumn } from "./SurgeBoard";
import { useRowSort, applyRowSort } from "./TableHeader";

const SURGE_LABELS: Record<SurgeSource, string> = {
  surge: "Movers",
  dexscreener: "All Markets",
  pumplive: "Crypto",
  topstreams: "TradFi",
};

/* Desktop (≥sm) Discover layout: tabs + filter controls row + live content. */
export default function DesktopDiscover() {
  const {
    eyeOff,
    setEyeOff,
    setFilterOpen,
    tab,
    setTab,
    surgeSource,
  } = useHyzrUI();
  const { tokens, now, history, ath, status } = useLive();
  const [tf, setTf] = useState<Timeframe>("5m");
  const [spinning, setSpinning] = useState(false);

  const isSurge = tab === "surge";
  const boardMode = isSurge;
  const { sort, setSort } = useRowSort();

  /* ---------------- live row models ---------------- */
  const tableRows = useMemo(() => {
    if (boardMode) return [];
    const list = [...tokens];
    const out =
    tab === "top" ? (
      // Top = biggest 24h movers (established + launches), same hard gates:
      // real icon, launchpad coin, real 24h activity — no dead rows.
      list
        .filter((t) => topEligible(t, now))
        .sort((a, b) => b.v24h - a.v24h)
        .slice(0, 40)
        .map((t) =>
          buildRow(t, { tf, now, series: dispSeries(t, history(t.id)), athMc: ath(t.id) }),
        )
    ) : tab === "trending" ? (
      // Trending — our own TrendScore engine (see live/trend.ts): the whole
      // pump.fun launchpad universe (seconds-old bonding + months-old
      // graduated) ranked by activity × quality × momentum × freshness ×
      // acceleration, with hard icon/activity gates. Finds coins that are
      // trending RIGHT NOW instead of rewarding yesterday's volume.
      rankTrending(list, tf, now)
        .slice(0, 40)
        .map((t) =>
          buildRow(t, { tf, now, series: dispSeries(t, history(t.id)), athMc: ath(t.id) }),
        )
    ) : (
      // DEX Screener: trending rank order (icon gate only — mirrors GT's list)
      list
        .filter((t) => !!t.image && !t.nsfw)
        .sort((a, b) => {
          const ra = a.tr ?? 9_999;
          const rb = b.tr ?? 9_999;
          if (ra !== rb) return ra - rb;
          return (b.v5 ?? 0) - (a.v5 ?? 0);
        })
        .slice(0, 40)
        .map((t) =>
          buildRow(t, { tf, now, series: dispSeries(t, history(t.id)), athMc: ath(t.id) }),
        )
    );
    return applyRowSort(out, sort);
  }, [tokens, tab, tf, now, boardMode, history, ath, sort]);

  const board = useMemo<SurgeColumn[]>(() => {
    if (!boardMode) return [];
    const withCtx = (t: LiveToken) =>
      buildRow(t, { tf, now, series: dispSeries(t, history(t.id)), athMc: ath(t.id) });
    const active = (t: LiveToken) => !!t.image && (tfVol(t, tf) > 0 || t.v24h > 0);

    if (surgeSource === "surge") {
      // Movers — biggest timeframe gainers & losers with live activity
      const movers = tokens.filter(active);
      const gainers = [...movers]
        .sort((a, b) => tfCh(b, tf) - tfCh(a, tf))
        .slice(0, 22)
        .map(withCtx);
      const losers = [...movers]
        .sort((a, b) => tfCh(a, tf) - tfCh(b, tf))
        .slice(0, 22)
        .map(withCtx);
      return [
        { title: "Gainers", rows: gainers },
        { title: "Losers", rows: losers },
      ];
    }
    if (surgeSource === "pumplive") {
      // Crypto — hottest crypto perps by trend score
      const crypto = [...tokens]
        .filter((t) => t.dex === "crypto" && active(t))
        .sort((a, b) => trendScore(b, tf, now) - trendScore(a, tf, now))
        .slice(0, 44)
        .map(withCtx);
      const half = Math.ceil(crypto.length / 2);
      return [
        { title: "Top Crypto", rows: crypto.slice(0, half) },
        { title: "Top Crypto", rows: crypto.slice(half) },
      ];
    }
    if (surgeSource === "topstreams") {
      // TradFi — equities, indices, commodities, forex by 24h volume
      const tradfi = [...tokens]
        .filter((t) => ["equity", "commodity", "forex", "index"].includes(t.dex) && active(t))
        .sort((a, b) => b.v24h - a.v24h)
        .slice(0, 44)
        .map(withCtx);
      const half = Math.ceil(tradfi.length / 2);
      return [
        { title: "Top TradFi Markets", rows: tradfi.slice(0, half) },
        { title: "Top TradFi Markets", rows: tradfi.slice(half) },
      ];
    }
    // All Markets — trend score across the whole universe
    const all = [...tokens]
      .filter(active)
      .sort((a, b) => trendScore(b, tf, now) - trendScore(a, tf, now))
      .slice(0, 44)
      .map(withCtx);
    const half = Math.ceil(all.length / 2);
    return [
      { title: "All Markets", rows: all.slice(0, half) },
      { title: "All Markets", rows: all.slice(half) },
    ];
  }, [tokens, surgeSource, boardMode, tf, now, history, ath]);

  return (
    <div className="hidden h-full w-full flex-1 flex-col items-center justify-center overflow-auto sm:flex">
      <div className="flex h-full w-full flex-1 flex-col items-center justify-center overflow-hidden px-[16px] py-[24px] lg:px-[24px]">
        {/* controls row */}
        <div className="mb-[16px] flex h-[32px] min-h-[32px] w-full max-w-[1420px] flex-row items-center justify-center gap-[24px]">
          {/* tabs */}
          <div className="flex flex-1 flex-row items-center justify-start gap-[24px] whitespace-nowrap">
            <button
              type="button"
              onClick={() => setTab("top")}
              className="flex h-[32px] flex-row items-center justify-start gap-[24px]"
            >
              <span
                className={`text-[16px] font-medium tracking-[-0.02em] transition-colors duration-150 sm:text-[20px] ${
                  tab === "top"
                    ? "text-textPrimary"
                    : "text-textTertiary hover:text-textPrimary"
                }`}
              >
                Top
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTab("trending")}
              className="flex h-[32px] flex-row items-center justify-start gap-[24px]"
            >
              <span
                className={`text-[16px] font-medium tracking-[-0.02em] transition-colors duration-150 sm:text-[20px] ${
                  tab === "trending"
                    ? "text-textPrimary"
                    : "text-textTertiary hover:text-textPrimary"
                }`}
              >
                Trending
              </span>
            </button>
            <span className="contents">
              <Popover
                gap={10}
                content={(close) => <SurgeMenuContent close={close} />}
                button={({ open, toggle }) => (
                  <button
                    type="button"
                    onClick={toggle}
                    className="group flex h-[36px] cursor-pointer flex-row items-center justify-center"
                  >
                    <span
                      className={`text-[16px] font-medium tracking-[-0.02em] transition-colors duration-150 ease-in-out sm:text-[18px] ${
                        isSurge
                          ? "text-textPrimary"
                          : "text-textTertiary group-hover:text-textPrimary"
                      }`}
                    >
                      {SURGE_LABELS[surgeSource]}
                    </span>
                    <i
                      className={`ri-arrow-down-s-line ml-1 text-[20px] transition-all duration-150 ease-in-out group-hover:rotate-180 ${
                        isSurge ? "text-textPrimary" : "text-textTertiary group-hover:text-textPrimary"
                      } ${open ? "rotate-180 !text-textPrimary" : ""}`}
                    />
                  </button>
                )}
              />
            </span>
          </div>

          {/* right controls */}
          <div className="relative flex min-w-[0px] flex-row items-center justify-start gap-[24px] whitespace-nowrap">
            <div className="pointer-events-none absolute right-0 top-0 z-40 flex h-full w-[32px] items-center justify-end bg-gradient-to-l from-background to-transparent">
              <button
                type="button"
                className="duration-125 absolute right-0 flex h-6 w-6 items-center justify-center text-textSecondary opacity-0 transition-all ease-in-out hover:text-textPrimary"
              >
                <i className="ri-arrow-right-wide-line mb-[1px] text-[20px]" />
              </button>
            </div>
            <div className="no-scrollbar flex min-w-[0px] flex-row items-center justify-start gap-[24px] overflow-x-auto overflow-y-hidden whitespace-nowrap">
              <TimeframeTabs active={tf} onChange={(v) => setTf(v as Timeframe)} />

              {/* mobile-only filter button (as in the original) */}
              <button
                type="button"
                onClick={() => setFilterOpen(true)}
                className="flex h-[32px] flex-shrink-0 flex-row items-center justify-center gap-[8px] rounded-full bg-primaryStroke px-[12px] transition-all duration-150 ease-in-out hover:bg-secondaryStroke/80 sm:hidden"
              >
                <div className="relative">
                  <i className="ri-equalizer-3-line text-[18px] text-textPrimary" />
                </div>
                <div className="flex flex-row items-center justify-start gap-[4px] whitespace-nowrap">
                  <span className="text-[14px] font-bold text-textPrimary">
                    Filter
                  </span>
                </div>
                <i className="ri-arrow-down-s-line text-[18px] text-textPrimary" />
              </button>

              {/* settings (table modes) */}
              {!boardMode && (
                <span className="contents">
                  <Popover
                    align="end"
                    gap={10}
                    content={(close) => <SettingsMenuContent close={close} />}
                    button={({ toggle }) => (
                      <button
                        type="button"
                        onClick={toggle}
                        className="group relative -mr-[5px] flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-background transition-colors hover:bg-primaryStroke/60"
                      >
                        <span className="relative flex items-center justify-center">
                          <i
                            className="ri-settings-3-line leading-none text-textSecondary group-hover:text-textPrimary"
                            style={{ fontSize: 16 }}
                          />
                        </span>
                      </button>
                    )}
                  />
                </span>
              )}

              {/* hide-holders eye */}
              <span className="contents">
                <button
                  type="button"
                  onClick={() => setEyeOff(!eyeOff)}
                  className="group relative -mr-[5px] flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-background transition-colors hover:bg-primaryStroke/60"
                >
                  <i
                    className={`${
                      eyeOff ? "ri-eye-off-line" : "ri-eye-line"
                    } text-textSecondary group-hover:text-textPrimary`}
                    style={{ fontSize: 16 }}
                  />
                </button>
              </span>

              {!boardMode && (
                <button
                  type="button"
                  onClick={() => {
                    setSpinning(true);
                    setTimeout(() => setSpinning(false), 500);
                  }}
                  className="group flex h-[32px] w-[32px] flex-shrink-0 cursor-pointer flex-row items-center justify-center rounded-full transition-colors duration-150 ease-in-out hover:bg-primaryStroke/60"
                >
                  <i
                    className={`ri-arrow-down-line text-[18px] text-textSecondary transition-colors duration-150 ease-in-out group-hover:text-textPrimary ${
                      spinning ? "spin-once" : ""
                    }`}
                  />
                </button>
              )}

              <div className="flex flex-row items-center gap-[8px]">
                <Popover
                  align="end"
                  gap={8}
                  content={(close) => <TimerMenuContent close={close} />}
                  button={({ open, toggle }) => (
                    <button
                      type="button"
                      aria-label="Timer"
                      onClick={toggle}
                      className={`relative flex h-[24px] w-[24px] cursor-pointer flex-row items-center justify-center rounded-[6px] transition-colors ${
                        open
                          ? "bg-secondaryStroke/35"
                          : "bg-secondaryStroke/20 hover:bg-secondaryStroke/35"
                      }`}
                    >
                      <i className="ri-timer-line text-[14px] text-textTertiary" />
                    </button>
                  )}
                />
                <WalletSelect />
                <QuickBuyInput />
              </div>
            </div>
          </div>
        </div>

        {/* content */}
        <div className="flex h-full w-full flex-1 flex-col items-center justify-center overflow-auto">
          {boardMode ? (
            <SurgeBoard columns={board} loading={status === "connecting"} />
          ) : (
            <DiscoverTable rows={tableRows} sort={sort} onSort={setSort} />
          )}
        </div>
      </div>
    </div>
  );
}
