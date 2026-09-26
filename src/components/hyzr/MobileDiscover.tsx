"use client";

import { useMemo, useState } from "react";
import { WalletSelect, QuickBuyInput } from "./controls";
import { IconBookmarkX } from "./HyzrIcons";
import { useHyzrUI, type DiscoverTab } from "./ui/HyzrUI";
import { useLive } from "./live/LiveProvider";
import { buildRow, dispSeries, tfCh, type Timeframe } from "./live/toRow";
import { rankTrending, topEligible, trendScore } from "./live/trend";
import DiscoverTable from "./DiscoverTable";
import SurgeBoard, { type SurgeColumn } from "./SurgeBoard";
import { useRowSort, applyRowSort } from "./TableHeader";

const MOBILE_CHAINS = [
  { id: "all", label: "Show all markets", icon: "ri-global-line" },
  { id: "crypto", label: "Show crypto", icon: "ri-bit-coin-line" },
  { id: "equity", label: "Show equities", icon: "ri-line-chart-line" },
  { id: "index", label: "Show indices", icon: "ri-bar-chart-grouped-line" },
  { id: "commodity", label: "Show commodities", icon: "ri-copper-coin-line" },
  { id: "forex", label: "Show forex", icon: "ri-exchange-dollar-line" },
];

const MOBILE_TABS: { id: DiscoverTab; label: string }[] = [
  { id: "top", label: "Top" },
  { id: "trending", label: "Trending" },
  { id: "surge", label: "Surge" },
];

/* Mobile (<sm) Discover layout: chain switcher + tabs + collapsible panel + live feed. */
export default function MobileDiscover() {
  const { setFilterOpen, tab, setTab, surgeSource, eyeOff, setEyeOff } = useHyzrUI();
  const { tokens, now, history, ath } = useLive();
  const [chain, setChain] = useState("all");
  const [panelOpen, setPanelOpen] = useState(false);
  const [tf, setTf] = useState<Timeframe>("5m");
  const [favsOnly, setFavsOnly] = useState(false);
  const { sort, setSort } = useRowSort();
  const boardMode = tab === "surge";

  const rows = useMemo(() => {
    const list = chain === "all" ? tokens : tokens.filter((t) => t.dex === chain);
    const opts = (t: (typeof tokens)[number]) => ({
      tf,
      now,
      series: dispSeries(t, history(t.id)),
      athMc: ath(t.id),
    });
    const favSyms = favsOnly
      ? new Set<string>(
          JSON.parse(localStorage.getItem("hyzr-starred") ?? "[]") as string[],
        )
      : null;
    const pick = <T,>(items: T[]) =>
      favSyms
        ? (items.filter((r) => favSyms.has((r as { symbol: string }).symbol)) as T[])
        : items;
    if (tab === "top") {
      return pick(
        list
          .filter((t) => topEligible(t, now))
          .sort((a, b) => b.v24h - a.v24h)
          .slice(0, 25)
          .map((t) => buildRow(t, opts(t))),
      );
    }
    if (tab === "trending") {
      // same TrendScore engine as the desktop board
      return pick(
        rankTrending(list, tf, now)
          .slice(0, 25)
          .map((t) => buildRow(t, opts(t))),
      );
    }
    return pick(
      list
        .filter((t) => !!t.image && !t.nsfw)
        .sort((a, b) => b.mc - a.mc)
        .slice(0, 25)
        .map((t) => buildRow(t, opts(t))),
    );
  }, [tokens, tab, now, history, ath, tf, chain, favsOnly]);

  const sortedRows = useMemo(() => applyRowSort(rows, sort), [rows, sort]);

  const board = useMemo<SurgeColumn[]>(() => {
    if (!boardMode) return [];
    const withCtx = (t: (typeof tokens)[number]) =>
      buildRow(t, { tf, now, series: dispSeries(t, history(t.id)), athMc: ath(t.id) });
    const active = (t: (typeof tokens)[number]) =>
      !!t.image && (t.v5 > 0 || t.v24h > 0);
    const list = chain === "all" ? tokens : tokens.filter((t) => t.dex === chain);
    const src =
      surgeSource === "surge"
        ? [
            {
              title: "Gainers",
              rows: [...list]
                .filter(active)
                .sort((a, b) => tfCh(b, tf) - tfCh(a, tf))
                .slice(0, 20)
                .map(withCtx),
            },
          ]
        : surgeSource === "pumplive"
          ? [
              {
                title: "Top Crypto",
                rows: [...list]
                  .filter((t) => t.dex === "crypto" && active(t))
                  .sort((a, b) => trendScore(b, tf, now) - trendScore(a, tf, now))
                  .slice(0, 20)
                  .map(withCtx),
              },
            ]
          : surgeSource === "topstreams"
            ? [
                {
                  title: "Top TradFi Markets",
                  rows: [...list]
                    .filter(
                      (t) =>
                        ["equity", "commodity", "forex", "index"].includes(t.dex) &&
                        active(t),
                    )
                    .sort((a, b) => b.v24h - a.v24h)
                    .slice(0, 20)
                    .map(withCtx),
                },
              ]
            : [
                {
                  title: "All Markets",
                  rows: [...list]
                    .filter(active)
                    .sort((a, b) => trendScore(b, tf, now) - trendScore(a, tf, now))
                    .slice(0, 20)
                    .map(withCtx),
                },
              ];
    return src;
  }, [tokens, boardMode, surgeSource, now, history, ath, tf, chain]);

  return (
    <div className="flex h-full w-full flex-1 flex-col items-center justify-start gap-[0px] overflow-hidden pb-[4px] pt-[16px] sm:hidden">
      <div className="flex w-full flex-col items-center justify-start px-0 pb-[16px] transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] sm:px-[16px]">
        {/* header row */}
        <div className="flex h-[24px] w-full flex-row items-center justify-between px-[16px]">
          <div className="flex min-w-0 flex-1 flex-row items-center gap-[8px]">
            {/* chain switcher */}
            <div className="flex items-center gap-1">
              {MOBILE_CHAINS.map((c) => (
                <span className="contents" key={c.id}>
                  <button
                    type="button"
                    aria-label={c.label}
                    onClick={() => setChain(c.id)}
                    className={`relative flex h-[32px] w-[32px] items-center justify-center rounded-full transition-[transform,opacity,background-color] duration-150 ${
                      chain === c.id
                        ? "scale-110 bg-primaryStroke/60"
                        : "opacity-60 hover:bg-primaryStroke/30 hover:opacity-100"
                    }`}
                  >
                    <i className={`${c.icon} text-[15px] text-[#c5cbd1]`} />
                  </button>
                </span>
              ))}
            </div>

            {/* tabs */}
            <div className="relative flex min-w-0 flex-1 flex-row">
              <div className="no-scrollbar flex flex-row items-center justify-start gap-[24px] overflow-x-auto overflow-y-hidden">
                {MOBILE_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className="flex h-[32px] flex-row items-center justify-center"
                  >
                    <span
                      className={`text-[16px] font-medium leading-[21px] transition-all duration-[65ms] ease-out active:scale-[0.96] active:bg-backgroundSecondary/65 ${
                        tab === t.id
                          ? "text-textPrimary"
                          : "text-textTertiary active:text-textSecondary"
                      }`}
                    >
                      {t.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* timeframe/settings pill */}
          <div className="flex items-center gap-[8px]">
            <button
              type="button"
              onClick={() => setPanelOpen((v) => !v)}
              className="relative flex h-[36px] min-w-[36px] items-center justify-center gap-[7px] rounded-full border border-primaryStroke bg-transparent pl-[9px] pr-[6px] text-textSecondary transition-scale duration-[65ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] active:scale-[0.96] active:bg-primaryStroke/40"
            >
              <span className="text-[14px] font-medium text-primaryBlue">{tf}</span>
              <span className="text-[14px] font-medium">P1</span>
              <i className="ri-settings-3-line text-[20px] transition-all duration-[135ms] ease-[cubic-bezier(0.25,0.1,0.25,1)]" />
            </button>
          </div>
        </div>

        {/* collapsible panel (collapsed by default, as in the snapshot) */}
        <div
          className={`w-full overflow-hidden transition-all duration-[135ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] ${
            panelOpen ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="pt-[24px]">
            <div className="flex w-full flex-col items-start justify-start gap-[16px] px-[16px]">
              <div className="flex w-full flex-row items-center justify-between gap-[16px]">
                <div className="flex flex-row items-center justify-start gap-[4px]">
                  {["1m", "5m", "30m", "1h"].map((tfk) => (
                    <button
                      key={tfk}
                      type="button"
                      onClick={() => setTf(tfk as Timeframe)}
                      className={`relative flex h-[32px] flex-row items-center justify-start whitespace-nowrap rounded-[8px] px-[8px] active:text-primaryBlue ${
                        tfk === tf ? "text-primaryBlue" : "text-textPrimary"
                      }`}
                    >
                      <span className="pointer-events-none absolute inset-0 z-0 rounded-[8px] bg-primaryBlue/20 opacity-0 will-change-transform" />
                      <span className="relative z-[1] text-[14px] font-medium">
                        {tfk}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="flex flex-row items-center gap-4">
                  <span className="contents">
                    <button
                      type="button"
                      title={favsOnly ? "Showing favorites only" : "Show favorites only"}
                      onClick={() => setFavsOnly((v) => !v)}
                      className={`group relative flex h-8 w-8 items-center justify-center rounded-full bg-background transition-all duration-[65ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] active:scale-[0.96] active:bg-primaryStroke/60 ${
                        favsOnly ? "text-primaryBlue" : ""
                      }`}
                    >
                      <IconBookmarkX
                        size={20}
                        className="text-textSecondary group-active:text-textPrimary"
                      />
                    </button>
                  </span>
                  <span className="contents">
                    <button
                      type="button"
                      title={eyeOff ? "Show hidden tokens" : "Hide degenerate tokens"}
                      onClick={() => setEyeOff(!eyeOff)}
                      className={`group relative flex h-8 w-8 items-center justify-center rounded-full bg-background transition-all duration-[65ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] active:scale-[0.96] active:bg-primaryStroke/60 ${
                        eyeOff ? "text-primaryBlue" : ""
                      }`}
                    >
                      <i className="ri-eye-line text-textSecondary group-active:text-textPrimary" style={{ fontSize: 20 }} />
                    </button>
                  </span>
                  <button
                    type="button"
                    onClick={() => setFilterOpen(true)}
                    className="flex h-[32px] flex-row items-center justify-center gap-[8px] rounded-full bg-primaryStroke px-[12px] transition-all duration-[65ms] ease-out active:scale-[0.96] active:bg-secondaryStroke/80"
                  >
                    <div className="relative">
                      <i className="ri-equalizer-3-line text-[18px]" />
                    </div>
                    <div className="flex flex-row items-center justify-start gap-[4px] whitespace-nowrap">
                      <span className="text-[14px] font-bold">Filter</span>
                    </div>
                    <i className="ri-arrow-down-s-line text-[18px] text-textPrimary" />
                  </button>
                </div>
              </div>
              <div className="flex w-full flex-row items-center justify-between gap-[16px]">
                <div className="flex h-full flex-1 flex-row items-center justify-between gap-[8px]">
                  <WalletSelect />
                  <QuickBuyInput compact />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* live content */}
      <div className="flex w-full flex-1 flex-col items-center justify-start gap-[16px] overflow-hidden px-[4px]">
        <div className="flex h-full w-full flex-1 flex-col items-start justify-start overflow-hidden rounded-[4px] p-[0px] lg:px-[24px]">
          <div className="flex h-full w-full flex-1 flex-col items-center justify-center overflow-auto">
            {boardMode ? (
              <SurgeBoard columns={board.slice(0, 1)} />
            ) : (
              <DiscoverTable rows={sortedRows} sort={sort} onSort={setSort} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
