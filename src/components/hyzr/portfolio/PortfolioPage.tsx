"use client";
/**
 * PortfolioPage — 1:1 chrome with the real Portfolio page (Spot tab:
 * Balance / Realized PNL / Performance cards, Active Positions | History |
 * Top 100 tables, Activity | Transfers rail), fed by OUR paper account.
 * "Search for other wallets" loads any real Hyperliquid wallet's portfolio.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  createChart,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  useTradeStore,
  accountValueCalc,
  unrealizedPnl,
  DEMO_DEPOSIT,
  toast,
} from "@/lib/hyperliquid/tradeStore";
import { usePerpsData } from "@/lib/hyperliquid/perpsStore";
import { fetchAllMids } from "@/lib/hyperliquid/api";
import { useLive } from "../live/LiveProvider";
import HlIcon from "@/components/hyzr/perps/HlIcon";
import { baseName } from "@/lib/hyperliquid/types";
import TraderIdentity from "./TraderIdentity";

type Win = "1d" | "7d" | "30d" | "Max";
const WIN_MS: Record<Win, number> = {
  "1d": 24 * 3600_000,
  "7d": 7 * 24 * 3600_000,
  "30d": 30 * 24 * 3600_000,
  Max: Number.MAX_SAFE_INTEGER,
};

/* ------------------------------------------------------------------ */

export default function PortfolioPage() {
  const [win, setWin] = useState<Win>("Max");
  const [table, setTable] = useState<"positions" | "history" | "top100">("positions");
  const [rightTab, setRightTab] = useState<"activity" | "transfers">("activity");
  const [search, setSearch] = useState("");
  const [otherWallet, setOtherWallet] = useState<string | null>(null);
  /** balance-card display currency: USD or live SOL denomination */
  const [denom, setDenom] = useState<"USD" | "SOL">("USD");
  const solPx = useLive().sol || 0;

  // live marks
  const [mids, setMids] = useState<Record<string, number>>({});
  useEffect(() => {
    let alive = true;
    const tick = () =>
      fetchAllMids()
        .then((m) => alive && setMids(m))
        .catch(() => {});
    tick();
    const t = setInterval(tick, 2_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const balance = useTradeStore((s) => s.balance);
  const positions = useTradeStore((s) => s.positions);
  const fills = useTradeStore((s) => s.fills);

  const accountValue = useMemo(
    () => accountValueCalc(balance, positions, mids),
    [balance, positions, mids],
  );
  const unrealized = useMemo(() => {
    let u = 0;
    for (const p of Object.values(positions)) {
      u += unrealizedPnl(p, mids[p.coin] ?? p.entryPx);
    }
    return u;
  }, [positions, mids]);

  /* other-wallet mode */
  const [walletData, setWalletData] = useState<{
    portfolio: Record<string, { av: [number, number][]; pnl: [number, number][] }>;
    state: { accountValue: number; positions: { coin: string; szi: number; entryPx: number; value: number; unrealizedPnl: number; roe: number; lev: number }[] } | null;
    lb: { av: number } | null;
    stats: { realized: number; closedTrades: number; wins: number; losses: number; volume: number; winRate: number | null };
  } | null>(null);
  useEffect(() => {
    if (!otherWallet) {
      setWalletData(null);
      return;
    }
    let alive = true;
    fetch(`/api/tracker/wallet?address=${otherWallet}`)
      .then((r) => r.json())
      .then((j) => alive && setWalletData(j))
      .catch(() => {});
    const t = setInterval(() => {
      fetch(`/api/tracker/wallet?address=${otherWallet}`)
        .then((r) => r.json())
        .then((j) => alive && setWalletData(j))
        .catch(() => {});
    }, 20_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [otherWallet]);

  /* derived series from our fills */
  const derived = useMemo(() => {
    const chrono = [...fills].sort((a, b) => a.time - b.time);
    let eq = DEMO_DEPOSIT;
    let cumPnl = 0;
    const equity: [number, number][] = [];
    const realized: [number, number][] = [];
    for (const f of chrono) {
      eq += f.closedPnl - f.fee;
      cumPnl += f.closedPnl;
      equity.push([f.time, eq]);
      realized.push([f.time, cumPnl]);
    }
    // bucket per closed trade (ROI vs notional)
    let wins = 0;
    let losses = 0;
    const buckets: Record<string, number> = { gt500: 0, b200_500: 0, b0_200: 0, "b0_-50": 0, "lt-50": 0 };
    for (const f of chrono) {
      if (f.closedPnl === 0) continue;
      const notional = f.px * f.sz;
      const roi = notional > 0 ? f.closedPnl / notional : 0;
      if (f.closedPnl > 0) wins++;
      else losses++;
      if (roi > 5) buckets.gt500++;
      else if (roi > 2) buckets.b200_500++;
      else if (roi >= 0) buckets.b0_200++;
      else if (roi >= -0.5) buckets["b0_-50"]++;
      else buckets["lt-50"]++;
    }
    // sharpe from daily equity returns
    let sharpe: number | null = null;
    if (equity.length > 3) {
      const byDay = new Map<number, number>();
      byDay.set(0, DEMO_DEPOSIT);
      for (const [t, v] of equity) {
        byDay.set(Math.floor(t / 86_400_000), v);
      }
      const vals = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
      const rets: number[] = [];
      for (let i = 1; i < vals.length; i++) {
        if (vals[i - 1] > 0) rets.push(vals[i] / vals[i - 1] - 1);
      }
      if (rets.length > 1) {
        const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
        const sd = Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1));
        sharpe = sd > 0 ? (mean / sd) * Math.sqrt(365) : null;
      }
    }
    return { equity, realized, wins, losses, buckets, sharpe, realizedSum: cumPnl };
  }, [fills]);

  const ours = {
    totalValue: accountValue,
    unrealized,
    tradeable: balance,
    equity: derived.equity,
    realizedCurve: derived.realized,
    realizedSum: derived.realizedSum,
    wins: derived.wins,
    losses: derived.losses,
    sharpe: derived.sharpe,
    positions: Object.values(positions),
    fills,
  };

  const winKey = win === "1d" ? "day" : win === "7d" ? "week" : win === "30d" ? "month" : "allTime";
  const walletMissing =
    !!otherWallet && !!walletData && !walletData.state && !walletData.lb &&
    Object.keys(walletData.portfolio ?? {}).length === 0;
  const view = otherWallet && walletData && !walletMissing
    ? {
        totalValue: walletData.state?.accountValue ?? walletData.lb?.av ?? 0,
        unrealized:
          walletData.state?.positions.reduce((s, p) => s + p.unrealizedPnl, 0) ?? 0,
        tradeable: null as number | null,
        equity: walletData.portfolio?.[winKey]?.av ?? [],
        realizedCurve: walletData.portfolio?.[winKey]?.pnl ?? [],
        realizedSum: walletData.stats.realized,
        wins: walletData.stats.wins,
        losses: walletData.stats.losses,
        sharpe: null as number | null,
        positions: walletData.state?.positions ?? [],
        fills: [],
      }
    : ours;

  const cutoff = Date.now() - WIN_MS[win];
  const bestTrade = view.fills.reduce((best, fill) => Math.max(best, fill.closedPnl ?? 0), 0);
  const winRate = view.wins + view.losses > 0 ? (view.wins / (view.wins + view.losses)) * 100 : 0;
  const inWin = <T,>(arr: T[], getT: (x: T) => number): T[] =>
    win === "Max" ? arr : arr.filter((x) => getT(x) >= cutoff);

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!otherWallet ? <TraderIdentity pnl={view.realizedSum + view.unrealized} bestTrade={bestTrade} winRate={winRate} /> : null}
        {/* tabs row */}
        <div className="flex h-[52px] shrink-0 items-center gap-[10px] overflow-x-auto border-b border-primaryStroke/60 px-[12px] no-scrollbar sm:gap-[18px] sm:px-[24px]">
          {(
            [
              ["Spot", "spot", true],
              ["Wallets", "wallets", false],
              ["Perpetuals", "perpetuals", true],
              ["Predictions", "predictions", false],
              ["Compare", "compare", false],
            ] as [string, string, boolean][]
          ).map(([label, id, enabled]) => (
            <button
              key={id}
              type="button"
              disabled={!enabled}
              onClick={() => id === "spot" && setOtherWallet(null)}
              className={`flex h-[32px] shrink-0 items-center whitespace-nowrap text-[15px] font-medium leading-[21px] transition-all sm:text-[16px] ${
                enabled ? "" : "cursor-default text-textTertiary/40"
              } ${
                (id === "spot" && !otherWallet) || (id === "perpetuals" && !!otherWallet)
                  ? "text-textPrimary"
                  : enabled
                    ? "text-textTertiary hover:text-textSecondary"
                    : ""
              }`}
            >
              {label}
              {label === "Compare" ? (
                <span className="ml-[6px] rounded-full bg-[#F0B90B]/20 px-[6px] py-[1px] text-[9px] font-bold uppercase text-[#F0B90B]">
                  new
                </span>
              ) : null}
            </button>
          ))}
          <div className="ml-auto flex h-[36px] w-[150px] shrink-0 items-center gap-[8px] rounded-full border border-primaryStroke pl-[12px] pr-[6px] sm:w-[260px]">
            <i className="ri-search-2-line text-[16px] text-textSecondary" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for other wallets…"
              className="min-w-0 flex-1 bg-transparent text-[12px] text-textPrimary outline-none placeholder:text-textTertiary"
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                const v = search.trim().toLowerCase();
                if (/^0x[a-f0-9]{40}$/.test(v)) {
                  setOtherWallet(v);
                  toast(`Viewing ${v.slice(0, 8)}… portfolio`, "info");
                } else {
                  toast("Enter a valid 0x wallet address", "error");
                }
              }}
            />
            {otherWallet ? (
              <button
                type="button"
                onClick={() => {
                  setOtherWallet(null);
                  setSearch("");
                }}
                className="flex h-[24px] items-center gap-[3px] rounded-full bg-primaryBlue/20 px-[8px] text-[11px] font-medium text-primaryBlue"
              >
                <i className="ri-close-line text-[12px]" />
                My account
              </button>
            ) : null}
          </div>
        </div>

        {/* window toolbar */}
        {walletMissing ? (
          <div className="mx-[24px] mt-[6px] flex h-[34px] shrink-0 items-center gap-[8px] rounded-[8px] border border-decrease/40 bg-decrease/10 px-[12px] text-[12px] text-decrease">
            <i className="ri-error-warning-line" />
            No Hyperliquid account found for this address — check it and try again.
          </div>
        ) : null}
        <div className="flex h-[44px] shrink-0 items-center gap-[10px] px-[24px]">
          <div className="flex h-[28px] items-center gap-[6px] rounded-[8px] border border-primaryStroke bg-primaryStroke/30 px-[10px]">
            <i className="ri-coin-line text-[14px] text-textSecondary" />
            <span className="text-[12px] font-semibold text-textPrimary">
              {otherWallet ? `${otherWallet.slice(0, 6)}…${otherWallet.slice(-4)}` : "HYZR Vault"}
            </span>
            <i className="ri-arrow-down-s-line text-[14px] text-textTertiary" />
          </div>
          <span className="flex items-center gap-[5px] text-[12px] text-textTertiary">
            <i className="ri-list-unordered text-[14px]" />
            {view.positions.length}
          </span>
          <div className="ml-auto flex items-center gap-[4px]">
            {(Object.keys(WIN_MS) as Win[]).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWin(w)}
                className={`h-[28px] rounded-full px-[12px] text-[13px] font-medium transition-colors ${
                  win === w ? "text-primaryBlue" : "text-textTertiary hover:text-textSecondary"
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>

        {/* cards row */}
        <div className="grid shrink-0 grid-cols-1 gap-[12px] px-[12px] pb-[12px] sm:px-[24px] lg:grid-cols-3">
          {/* Balance */}
          <div className="flex flex-col overflow-hidden rounded-[10px] border border-primaryStroke">
            <div className="flex items-center justify-between px-[14px] pt-[12px]">
              <span className="text-[14px] font-medium text-textPrimary">Balance</span>
              <button
                type="button"
                title="Toggle USD / SOL display"
                onClick={() => setDenom((d) => (d === "USD" ? "SOL" : "USD"))}
                className="flex items-center gap-[4px] text-[12px] text-textSecondary transition-colors hover:text-textPrimary"
              >
                <i className="ri-arrow-up-down-line text-[13px]" />
                {denom}
              </button>
            </div>
            <div className="flex flex-col gap-[2px] px-[14px] pt-[6px]">
              <span className="text-[12px] text-textTertiary">Total Value</span>
              <span className="font-GeistMono text-[22px] font-normal text-textPrimary">
                {denom === "USD"
                  ? `$${view.totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                  : `◎ ${(solPx > 0 ? view.totalValue / solPx : 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
              </span>
              <span className="text-[12px] text-textTertiary">Unrealized PNL</span>
              <span className={`font-GeistMono text-[16px] ${upnlClass(view.unrealized)}`}>
                {denom === "USD"
                  ? `${view.unrealized >= 0 ? "+" : "-"}$${Math.abs(view.unrealized).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                  : `${view.unrealized >= 0 ? "+" : "-"}◎${(solPx > 0 ? Math.abs(view.unrealized) / solPx : 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
              </span>
            </div>
            <BalanceHeat equity={inWin(view.equity, (p) => p[0] ?? 0)} />
            <div className="h-[1px] w-full bg-primaryStroke" />
            <div className="flex flex-col gap-[4px] px-[14px] py-[10px]">
              <span className="text-[12px] text-textTertiary">Tradeable Balance</span>
              <span className="font-GeistMono text-[18px] text-textPrimary">
                {view.tradeable === null
                  ? "—"
                  : denom === "USD"
                    ? `$${view.tradeable.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                    : `◎ ${(solPx > 0 ? view.tradeable / solPx : 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
              </span>
            </div>
          </div>

          {/* Realized PNL */}
          <div className="flex flex-col overflow-hidden rounded-[10px] border border-primaryStroke">
            <div className="flex items-center justify-between px-[14px] pt-[12px]">
              <div className="flex items-center gap-[8px]">
                <span className="text-[14px] font-medium text-textPrimary">Realized PNL</span>
                <span className="rounded-full bg-[#F0B90B]/20 px-[6px] py-[1px] text-[9px] font-bold uppercase text-[#F0B90B]">
                  edge new
                </span>
              </div>
              <i className="ri-calendar-line text-[15px] text-textSecondary" />
            </div>
            <div className="relative min-h-[190px] flex-1">
              <PnlArea
                data={inWin(view.realizedCurve, (p) => p[0] ?? 0)}
                color={view.realizedSum >= 0 ? "#0B9981" : "#EC397A"}
              />
              <div className="pointer-events-none absolute bottom-[8px] left-[10px] flex items-center gap-[4px] text-[10px] font-bold text-textTertiary/50">
                <i className="ri-tv-2-line text-[12px]" />
              </div>
            </div>
          </div>

          {/* Performance */}
          <div className="flex flex-col overflow-hidden rounded-[10px] border border-primaryStroke">
            <div className="flex items-center justify-between px-[14px] pt-[12px]">
              <span className="text-[14px] font-medium text-textPrimary">Performance</span>
              <i className="ri-share-forward-line text-[15px] text-textSecondary" />
            </div>
            <div className="flex flex-col gap-[7px] px-[16px] pt-[8px] text-[12px]">
              <PerfRow
                label="Total Pnl"
                value={`${
                  view.realizedSum + view.unrealized >= 0 ? "+" : "-"
                }$${Math.abs(view.realizedSum + view.unrealized).toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}`}
                cls={upnlClass(view.realizedSum + view.unrealized)}
              />
              <PerfRow
                label="Realized PNL"
                value={`${view.realizedSum >= 0 ? "+" : "-"}$${Math.abs(view.realizedSum).toLocaleString(
                  undefined,
                  { maximumFractionDigits: 2 },
                )}`}
                cls={upnlClass(view.realizedSum)}
              />
              <div className="flex items-center justify-between">
                <span className="text-textSecondary">Total TXNS</span>
                <span className="flex items-center gap-[3px] font-GeistMono">
                  <span className="text-increase">{view.wins}</span>
                  <span className="text-textTertiary">/</span>
                  <span className="text-decrease">{view.losses}</span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-[4px] text-textSecondary">
                  Sharpe
                  <i
                    className="ri-information-line text-[12px] text-textTertiary"
                    title="Annualized Sharpe of daily account returns"
                  />
                </span>
                <span className="font-GeistMono text-textTertiary">
                  {view.sharpe !== null ? view.sharpe.toFixed(2) : "N/A"}
                </span>
              </div>
            </div>
            <div className="mt-auto flex flex-col gap-[7px] pb-[10px] pt-[8px]">
              {(
                [
                  [">500%", derived.buckets.gt500, "bg-increase"],
                  ["200% ~ 500%", derived.buckets.b200_500, "bg-increase"],
                  ["0% ~ 200%", derived.buckets.b0_200, "bg-increase"],
                  ["0% ~ -50%", derived.buckets["b0_-50"], "bg-decrease"],
                  ["< -50%", derived.buckets["lt-50"], "bg-decrease"],
                ] as [string, number, string][]
              ).map(([label, n, dot]) => (
                <div key={label} className="flex h-[16px] items-center gap-[7px] px-[16px]">
                  <span className="flex h-[16px] w-[16px] items-center justify-center">
                    <span className={`h-[9px] w-[9px] rounded-full ${dot}`} style={{ opacity: 0.2 + Math.min(0.8, n / 12) }} />
                  </span>
                  <span className="flex-1 text-[12px] text-textSecondary">{label}</span>
                  <span className="text-[12px] text-textPrimary">{n}</span>
                </div>
              ))}
              <div className="mx-[16px] mt-[2px] h-[3px] rounded-full bg-decrease" />
            </div>
          </div>
        </div>

        {/* bottom tables */}
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col border-t border-primaryStroke">
            <div className="flex min-h-[46px] shrink-0 flex-wrap items-center gap-[4px] border-b border-primaryStroke/60 px-[12px] sm:h-[46px] sm:flex-nowrap sm:px-[24px]">
              {(
                [
                  ["positions", "Active Positions"],
                  ["history", "History"],
                  ["top100", "Top 100"],
                ] as [typeof table, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTable(id)}
                  className={`relative flex h-[46px] shrink-0 items-center whitespace-nowrap px-[10px] text-[14px] font-medium sm:px-[12px] ${
                    table === id ? "text-textPrimary" : "text-textTertiary hover:text-textSecondary"
                  }`}
                >
                  {label}
                  {table === id ? (
                    <span className="absolute inset-x-[10px] bottom-0 h-[2px] rounded-full bg-textPrimary sm:inset-x-[12px]" />
                  ) : null}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-[8px]">
                <div className="flex h-[28px] w-[130px] items-center gap-[7px] rounded-full border border-primaryStroke px-[11px] sm:w-[200px]">
                  <i className="ri-search-line text-[13px] text-textTertiary" />
                  <input
                    placeholder="Search by name or address"
                    className="min-w-0 flex-1 bg-transparent text-[12px] text-textPrimary outline-none placeholder:text-textTertiary"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (otherWallet) return;
                    if (confirm("Reset the paper account back to $10,000?")) {
                      useTradeStore.getState().resetAccount();
                      toast("Paper account reset", "success");
                    }
                  }}
                  className="flex items-center gap-[5px] rounded-[4px] px-[8px] py-1 text-[12px] font-medium text-textSecondary hover:bg-primaryStroke/60"
                >
                  <i className="ri-restart-line text-[14px] text-textTertiary" />
                  Reset
                </button>
                <button
                  type="button"
                  title="Toggle USD / SOL display"
                  onClick={() => setDenom((d) => (d === "USD" ? "SOL" : "USD"))}
                  className="flex items-center gap-[5px] rounded-[4px] px-[8px] py-1 text-[12px] font-medium text-textSecondary hover:bg-primaryStroke/60"
                >
                  <i className="ri-arrow-up-down-line text-[14px] text-textTertiary" />
                  {denom}
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto">
              {table === "positions" ? (
                <PositionsTable
                  rows={
                    otherWallet
                      ? (view.positions as { coin: string; szi: number; entryPx: number; value: number; unrealizedPnl: number; lev?: number }[])
                      : view.positions.map((p) => ({
                          coin: p.coin,
                          szi: p.szi,
                          entryPx: p.entryPx,
                          value: Math.abs(p.szi) * (mids[p.coin] ?? p.entryPx),
                          unrealizedPnl: unrealizedPnl(p, mids[p.coin] ?? p.entryPx),
                          lev: p.leverage,
                        }))
                  }
                  mids={mids}
                  own={!otherWallet}
                />
              ) : table === "history" ? (
                <HistoryTable fills={inWin(ours.fills, (f) => f.time).slice().sort((a, b) => b.time - a.time)} />
              ) : (
                <Top100 fills={ours.fills} />
              )}
            </div>
          </div>

          {/* right rail: activity / transfers */}
          <div className="hidden w-[360px] shrink-0 flex-col border-l border-t border-primaryStroke xl:flex">
            <div className="flex h-[46px] shrink-0 items-center gap-[4px] border-b border-primaryStroke/60 px-[16px]">
              {(
                [
                  ["activity", "Activity"],
                  ["transfers", "Transfers"],
                ] as [typeof rightTab, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setRightTab(id)}
                  className={`relative flex h-[46px] items-center px-[10px] text-[14px] font-medium ${
                    rightTab === id ? "text-textPrimary" : "text-textTertiary hover:text-textSecondary"
                  }`}
                >
                  {label}
                  {rightTab === id ? (
                    <span className="absolute inset-x-[10px] bottom-0 h-[2px] rounded-full bg-textPrimary" />
                  ) : null}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {rightTab === "activity" ? (
                ours.fills.length === 0 ? (
                  <Empty text="No activity yet — place your first trade on the Perpetuals tab." />
                ) : (
                  ours.fills
                    .slice()
                    .sort((a, b) => b.time - a.time)
                    .slice(0, 80)
                    .map((f) => (
                      <div key={f.id} className="flex items-center gap-[8px] border-b border-primaryStroke/30 px-[14px] py-[7px] text-[12px]">
                        <span
                          className={`flex h-[22px] w-[22px] items-center justify-center rounded-full ${
                            f.dir.startsWith("Open")
                              ? f.dir.includes("Long")
                                ? "bg-increase/15 text-increase"
                                : "bg-decrease/15 text-decrease"
                              : "bg-primaryStroke/60 text-textSecondary"
                          }`}
                        >
                          <i className={f.dir.includes("Long") ? "ri-arrow-up-right-line text-[12px]" : "ri-arrow-down-right-line text-[12px]"} />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="flex items-center gap-[5px]">
                            <HlIcon coin={f.coin} size={13} />
                            <span className="text-[12px] font-medium text-textPrimary">{baseName(f.coin)}</span>
                            <span className="text-[10px] text-textTertiary">{f.dir}</span>
                          </span>
                          <span className="text-[10px] text-textTertiary">
                            {new Date(f.time).toLocaleTimeString()} · {f.sz.toPrecision(4)} @ {f.px.toPrecision(6)}
                          </span>
                        </span>
                        <span className={`font-GeistMono text-[12px] ${upnlClass(f.closedPnl)}`}>
                          {f.closedPnl !== 0 ? `${f.closedPnl >= 0 ? "+" : ""}$${Math.abs(f.closedPnl).toFixed(2)}` : ""}
                        </span>
                      </div>
                    ))
                )
              ) : (
                <div className="flex flex-col">
                  <div className="flex items-center gap-[8px] border-b border-primaryStroke/30 px-[14px] py-[9px] text-[12px]">
                    <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-increase/15 text-increase">
                      <i className="ri-add-line text-[13px]" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[12px] font-medium text-textPrimary">Paper account seed</span>
                      <span className="text-[10px] text-textTertiary">
                        {ours.fills.length
                          ? new Date(ours.fills.slice().sort((a, b) => a.time - b.time)[0].time).toLocaleString()
                          : new Date().toLocaleString()}
                      </span>
                    </span>
                    <span className="font-GeistMono text-[12px] text-increase">+${DEMO_DEPOSIT.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function upnlClass(n: number) {
  return n > 0 ? "text-increase" : n < 0 ? "text-decrease" : "text-textSecondary";
}

function PerfRow({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-textSecondary">{label}</span>
      <span className={`font-GeistMono ${cls}`}>{value}</span>
    </div>
  );
}

/* hour-of-week heat strip with the live time pill (like the real card) */
const emptySubscribe = () => () => {};
function BalanceHeat({ equity }: { equity: [number, number][] }) {
  /* SSR-safe: the "now" marker/time pill render only after mount (server and
     first client pass agree, so no hydration mismatch across timezones) */
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const cells = useMemo(() => {
    const now = new Date();
    const grid: number[] = new Array(7 * 24).fill(0);
    for (let i = 1; i < equity.length; i++) {
      const d = new Date(equity[i][0]);
      const delta = equity[i][1] - equity[i - 1][1];
      const day = (d.getDay() + 6) % 7; // Mon=0
      grid[day * 24 + d.getHours()] += delta;
    }
    const max = Math.max(1, ...grid.map((v) => Math.abs(v)));
    return { grid, max, nowHour: now.getHours(), nowDay: (now.getDay() + 6) % 7, time: now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) };
  }, [equity]);

  return (
    <div className="relative px-[14px] py-[10px]">
      <div className="grid grid-cols-[14px_repeat(24,1fr)] gap-[2px]">
        <span />
        {Array.from({ length: 24 }).map((_, h) => (
          <span key={h} className="text-center text-[7px] leading-[8px] text-textTertiary/60">
            {h % 6 === 0 ? (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`) : ""}
          </span>
        ))}
        {["M", "T", "W", "T", "F", "S", "S"].map((d, di) => (
          <div key={di} className="contents">
            <span className="text-[7px] leading-[8px] text-textTertiary/60">{d}</span>
            {Array.from({ length: 24 }).map((_, h) => {
              const v = cells.grid[di * 24 + h];
              const intensity = Math.min(0.85, Math.abs(v) / cells.max);
              return (
                <span
                  key={h}
                  className="h-[8px] rounded-[2px]"
                  style={{
                    background:
                      v === 0
                        ? "rgba(50,53,66,0.35)"
                        : v > 0
                          ? `rgba(47,227,172,${0.15 + intensity * 0.7})`
                          : `rgba(236,57,122,${0.15 + intensity * 0.7})`,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      {/* now line + pill (mount-gated: timezone-dependent) */}
      {mounted ? (
        <>
          <div
            className="pointer-events-none absolute inset-y-[8px] w-[1.5px] bg-textPrimary/40"
            style={{ left: `calc(28px + ${(cells.nowHour + 0.5) * ((100 - 8) / 24)}% * 0.96)` }}
          />
          <div className="pointer-events-none absolute right-[16px] top-[6px]">
            <span className="rounded-full bg-textPrimary/10 px-[8px] py-[2px] text-[9px] font-medium text-textPrimary backdrop-blur">
              {cells.time}
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}

function PnlArea({ data, color }: { data: [number, number][]; color: string }) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight || 190,
      layout: { background: { color: "transparent" }, textColor: "#777a8c", fontSize: 10, attributionLogo: true },
      grid: { vertLines: { visible: false }, horzLines: { color: "rgba(50,53,66,0.3)" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      handleScale: false,
      handleScroll: false,
    });
    seriesRef.current = chart.addSeries(AreaSeries, {
      lineColor: color,
      topColor: `${color}30`,
      bottomColor: `${color}05`,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [color]);

  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setData(
      data.map(([t, v]) => ({ time: Math.floor(t / 1000) as UTCTimestamp, value: v })),
    );
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  return <div ref={elRef} className="h-full min-h-[190px] w-full" />;
}

/* ---------------- tables ---------------- */

function PositionsTable({
  rows,
  mids,
  own,
}: {
  rows: { coin: string; szi: number; entryPx: number; value: number; unrealizedPnl: number; lev?: number }[];
  mids: Record<string, number>;
  own: boolean;
}) {
  const closePos = useTradeStore((s) => s.closePosition);
  if (!rows.length) {
    return <Empty text="No open positions — trade on the Perpetuals tab or copy a whale." />;
  }
  return (
    <div className="min-w-[740px]">
      <div className="sticky top-0 z-[1] flex h-[28px] items-center border-b border-primaryStroke bg-background px-[24px] text-[12px] text-textTertiary">
        <span className="min-w-[150px] flex-1">Token</span>
        <span className="w-[110px]">Bought</span>
        <span className="w-[110px]">Sold</span>
        <span className="w-[110px]">Remaining</span>
        <span className="w-[120px]">PNL</span>
        <span className="w-[100px]">Opened</span>
        <span className="w-[100px] text-right">Action</span>
      </div>
      {rows.map((p, i) => {
        const mark = mids[p.coin] ?? p.entryPx;
        return (
          <div key={i} className="flex h-[42px] items-center border-b border-primaryStroke/30 px-[24px] text-[12px]">
            <span className="flex min-w-[150px] flex-1 items-center gap-[8px]">
              <HlIcon coin={p.coin} size={18} />
              <span className="font-medium text-textPrimary">{baseName(p.coin)}</span>
              {p.lev ? <span className="rounded bg-primaryStroke/60 px-[4px] text-[10px] text-textSecondary">{p.lev}x</span> : null}
            </span>
            <span className={`w-[110px] font-GeistMono ${p.szi > 0 ? "text-increase" : "text-textTertiary"}`}>
              {p.szi > 0 ? p.szi.toPrecision(5) : "—"}
            </span>
            <span className={`w-[110px] font-GeistMono ${p.szi < 0 ? "text-decrease" : "text-textTertiary"}`}>
              {p.szi < 0 ? Math.abs(p.szi).toPrecision(5) : "—"}
            </span>
            <span className="w-[110px] font-GeistMono text-textPrimary">
              {Math.abs(p.szi).toPrecision(5)}{" "}
              <span className="text-[10px] text-textTertiary">(@ {mark.toPrecision(6)})</span>
            </span>
            <span className={`w-[120px] font-GeistMono ${upnlClass(p.unrealizedPnl)}`}>
              {p.unrealizedPnl >= 0 ? "+" : "-"}${Math.abs(p.unrealizedPnl).toFixed(2)}
            </span>
            <span className="w-[100px] text-textTertiary">—</span>
            <span className="w-[100px] text-right">
              {own ? (
                <button
                  type="button"
                  onClick={() => void closePos(p.coin, 1)}
                  className="rounded-full bg-primaryStroke px-[10px] py-[3px] text-[11px] font-medium text-textSecondary hover:bg-decrease/20 hover:text-decrease"
                >
                  Close
                </button>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function HistoryTable({
  fills,
}: {
  fills: { id: string; coin: string; dir: string; px: number; sz: number; time: number; closedPnl: number; fee: number }[];
}) {
  if (!fills.length) return <Empty text="No closed trades yet." />;
  return (
    <div className="min-w-[740px]">
      <div className="sticky top-0 z-[1] flex h-[28px] items-center border-b border-primaryStroke bg-background px-[24px] text-[12px] text-textTertiary">
        <span className="w-[130px]">Time</span>
        <span className="min-w-[150px] flex-1">Token</span>
        <span className="w-[110px]">Action</span>
        <span className="w-[110px] text-right">Price</span>
        <span className="w-[100px] text-right">Size</span>
        <span className="w-[110px] text-right">PNL</span>
        <span className="w-[90px] text-right">Fee</span>
        <span className="w-[70px] text-right">Share</span>
      </div>
      {fills.map((f) => (
        <div key={f.id} className="flex h-[38px] items-center border-b border-primaryStroke/30 px-[24px] text-[12px]">
          <span className="w-[130px] text-textTertiary">{new Date(f.time).toLocaleString()}</span>
          <span className="flex min-w-[150px] flex-1 items-center gap-[7px]">
            <HlIcon coin={f.coin} size={16} />
            <span className="font-medium text-textPrimary">{baseName(f.coin)}</span>
          </span>
          <span
            className={`w-[110px] ${
              f.dir.startsWith("Open") ? (f.dir.includes("Long") ? "text-increase" : "text-decrease") : "text-textSecondary"
            }`}
          >
            {f.dir}
          </span>
          <span className="w-[110px] text-right font-GeistMono text-textSecondary">{f.px.toPrecision(6)}</span>
          <span className="w-[100px] text-right font-GeistMono text-textSecondary">{f.sz.toPrecision(4)}</span>
          <span className={`w-[110px] text-right font-GeistMono ${upnlClass(f.closedPnl)}`}>
            {f.closedPnl >= 0 ? "+" : "-"}${Math.abs(f.closedPnl).toFixed(2)}
          </span>
          <span className="w-[90px] text-right font-GeistMono text-textTertiary">${Math.abs(f.fee).toFixed(3)}</span>
          <span className="w-[70px] text-right"><button onClick={() => window.dispatchEvent(new CustomEvent("hyzr-share-trade", { detail: { coin: f.coin, pnl: f.closedPnl, price: f.px, dir: f.dir } }))} type="button" title="Create a HYZR PNL card" className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.035] text-textTertiary hover:border-white/20 hover:text-white"><i className="ri-share-forward-line" /></button></span>
        </div>
      ))}
    </div>
  );
}

function Top100({
  fills,
}: {
  fills: { coin: string; px: number; sz: number; closedPnl: number }[];
}) {
  const agg = useMemo(() => {
    const m = new Map<string, { vol: number; pnl: number; trades: number }>();
    for (const f of fills) {
      let a = m.get(f.coin);
      if (!a) {
        a = { vol: 0, pnl: 0, trades: 0 };
        m.set(f.coin, a);
      }
      a.vol += f.px * f.sz;
      a.pnl += f.closedPnl;
      a.trades++;
    }
    return [...m.entries()].map(([coin, s]) => ({ coin, ...s })).sort((a, b) => b.vol - a.vol).slice(0, 100);
  }, [fills]);
  if (!agg.length) return <Empty text="No traded tokens yet." />;
  const max = agg[0].vol || 1;
  return (
    <div className="min-w-[680px]">
      <div className="sticky top-0 z-[1] flex h-[28px] items-center border-b border-primaryStroke bg-background px-[24px] text-[12px] text-textTertiary">
        <span className="w-[40px]">#</span>
        <span className="min-w-[150px] flex-1">Token</span>
        <span className="w-[130px] text-right">Volume</span>
        <span className="w-[240px]">Share</span>
        <span className="w-[110px] text-right">PNL</span>
        <span className="w-[90px] text-right">Trades</span>
      </div>
      {agg.map((a, i) => (
        <div key={a.coin} className="flex h-[40px] items-center border-b border-primaryStroke/30 px-[24px] text-[12px]">
          <span className="w-[40px] font-GeistMono text-textTertiary">{i + 1}</span>
          <span className="flex min-w-[150px] flex-1 items-center gap-[7px]">
            <HlIcon coin={a.coin} size={16} />
            <span className="font-medium text-textPrimary">{baseName(a.coin)}</span>
          </span>
          <span className="w-[130px] text-right font-GeistMono text-textSecondary">
            ${a.vol.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
          <span className="w-[240px]">
            <div className="h-[7px] w-[90%] overflow-hidden rounded-full bg-primaryStroke/40">
              <div className="h-full rounded-full bg-primaryBlue/70" style={{ width: `${Math.max(3, (a.vol / max) * 100)}%` }} />
            </div>
          </span>
          <span className={`w-[110px] text-right font-GeistMono ${upnlClass(a.pnl)}`}>
            {a.pnl >= 0 ? "+" : "-"}${Math.abs(a.pnl).toFixed(2)}
          </span>
          <span className="w-[90px] text-right font-GeistMono text-textTertiary">{a.trades}</span>
        </div>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-[180px] flex-col items-center justify-center gap-[8px]">
      <i className="ri-inbox-line text-[24px] text-textTertiary/60" />
      <span className="text-[12px] text-textTertiary">{text}</span>
    </div>
  );
}
