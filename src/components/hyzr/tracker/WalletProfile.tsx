"use client";
/**
 * WalletProfile — full analysis drawer for any Hyperliquid wallet:
 * real PnL/account-value curves, leaderboard stats, derived per-trade
 * stats (win rate, avg win/loss, biggest win/loss), live positions,
 * fills tape, coin breakdown and biggest trades. All from /info.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  TrackerModal,
  WalletAvatar,
  PillAction,
  pnlClass,
  fmtUsdCompact,
  fmtPctCompact,
  ageStr,
  CoinChip,
} from "./bits";
import { shortAddr, useTrackerStore } from "@/lib/tracker/trackerStore";
import { baseName } from "@/lib/hyperliquid/types";

interface ProfileData {
  address: string;
  name: string | null;
  lb: {
    av: number;
    day: { pnl: number; roi: number; vlm: number };
    week: { pnl: number; roi: number; vlm: number };
    month: { pnl: number; roi: number; vlm: number };
    allTime: { pnl: number; roi: number; vlm: number };
  } | null;
  portfolio: Record<string, { av: [number, number][]; pnl: [number, number][] }>;
  state: {
    accountValue: number;
    marginUsed: number;
    positions: {
      coin: string;
      szi: number;
      entryPx: number;
      value: number;
      unrealizedPnl: number;
      roe: number;
      lev: number;
      levType: string;
      liqPx: number | null;
    }[];
  } | null;
  fills: {
    coin: string;
    px: string;
    sz: string;
    side: "B" | "A";
    time: number;
    dir: string;
    closedPnl: string;
  }[];
  stats: {
    closedTrades: number;
    wins: number;
    losses: number;
    winRate: number | null;
    realized: number;
    volume: number;
    fees: number;
    biggestWin: number;
    biggestLoss: number;
    avgWin: number;
    avgLoss: number;
    longs: number;
    shorts: number;
    coins: { coin: string; trades: number; vol: number; pnl: number }[];
  };
  bigTrades: { coin: string; px: number; sz: number; usd: number; side: "B" | "A"; dir: string; pnl: number | null; t: number }[];
}

type Win = "day" | "week" | "month" | "allTime";
const WIN_LABEL: Record<Win, string> = { day: "1D", week: "1W", month: "1M", allTime: "All" };

function AreaChart({
  data,
  color,
  height = 130,
}: {
  data: [number, number][];
  color: string;
  height?: number;
}) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      layout: { background: { color: "transparent" }, textColor: "#777a8c", fontSize: 10, attributionLogo: false },
      grid: { vertLines: { color: "rgba(50,53,66,0.35)" }, horzLines: { color: "rgba(50,53,66,0.35)" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      handleScale: false,
      handleScroll: false,
    });
    const series = chart.addSeries(AreaSeries, {
      lineColor: color,
      topColor: `${color}33`,
      bottomColor: `${color}05`,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    chartRef.current = chart;
    seriesRef.current = series;
    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [color, height]);

  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setData(
      data.map(([t, v]) => ({ time: Math.floor(t / 1000) as UTCTimestamp, value: v })),
    );
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  return <div ref={elRef} style={{ height }} className="w-full" />;
}

export default function WalletProfile({
  address,
  onClose,
  onOpenCopier,
}: {
  address: string | null;
  onClose: () => void;
  onOpenCopier?: (addr: string) => void;
}) {
  const [data, setData] = useState<ProfileData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [win, setWin] = useState<Win>("month");
  const [copiedAddr, setCopiedAddr] = useState(false);
  const wallets = useTrackerStore((s) => s.wallets);
  const addWallet = useTrackerStore((s) => s.addWallet);
  const removeWallet = useTrackerStore((s) => s.removeWallet);
  const addCopy = useTrackerStore((s) => s.addCopy);
  const tracked = address ? wallets.some((w) => w.address === address.toLowerCase()) : false;

  useEffect(() => {
    if (!address) return;
    let alive = true;
    const load = () =>
      fetch(`/api/tracker/wallet?address=${address}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
        .then((j: ProfileData) => {
          if (alive) setData(j);
        })
        .catch(() => {
          if (alive) setErr("Could not load wallet data");
        });
    load();
    const t = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [address]);

  const stat = useMemo(() => {
    if (!data?.lb) return null;
    return data.lb[win];
  }, [data, win]);

  const pnlCurve = data?.portfolio?.[win]?.pnl ?? [];
  const avCurve = data?.portfolio?.[win]?.av ?? [];

  return (
    <TrackerModal open={!!address} onClose={onClose} width={1080}>
      {!data ? (
        <div className="flex h-[320px] flex-col items-center justify-center gap-[10px]">
          {err ? (
            <>
              <i className="ri-error-warning-line text-[28px] text-textTertiary" />
              <span className="text-[13px] text-textSecondary">{err}</span>
            </>
          ) : (
            <>
              <div className="h-[28px] w-[28px] animate-spin rounded-full border-[2px] border-primaryStroke border-t-primaryBlue" />
              <span className="text-[13px] text-textTertiary">Loading wallet analysis…</span>
            </>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-col">
          {/* header */}
          <div className="flex shrink-0 flex-wrap items-center gap-[12px] border-b border-primaryStroke px-[12px] py-[12px] sm:px-[16px]">
            <WalletAvatar address={data.address} size={44} rounded="rounded-[10px]" />
            <div className="flex min-w-0 flex-col gap-[2px]">
              <div className="flex items-center gap-[8px]">
                <span className="truncate text-[16px] font-semibold text-textPrimary">
                  {data.name || shortAddr(data.address)}
                </span>
                <button
                  type="button"
                  className="flex items-center gap-[4px] rounded-[4px] bg-primaryStroke/60 px-[6px] py-[2px] text-[11px] font-GeistMono text-textSecondary hover:bg-primaryStroke"
                  onClick={() => {
                    void navigator.clipboard.writeText(data.address);
                    setCopiedAddr(true);
                    setTimeout(() => setCopiedAddr(false), 1200);
                  }}
                >
                  <i className={copiedAddr ? "ri-check-line" : "ri-file-copy-line"} />
                  {shortAddr(data.address)}
                </button>
                <a
                  href={`https://app.hyperliquid.xyz/explorer/address/${data.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-[22px] items-center gap-[4px] rounded-[4px] px-[6px] text-[11px] text-textTertiary hover:bg-primaryStroke/60 hover:text-textSecondary"
                >
                  <i className="ri-external-link-line" />
                  Hyperliquid
                </a>
              </div>
              <div className="flex flex-wrap items-center gap-x-[14px] gap-y-[4px] text-[12px]">
                <span className="text-textTertiary">
                  Account Value{" "}
                  <span className="font-GeistMono font-medium text-textPrimary">
                    {fmtUsdCompact(data.state?.accountValue ?? data.lb?.av ?? 0)}
                  </span>
                </span>
                {stat ? (
                  <span className="text-textTertiary">
                    {WIN_LABEL[win]} PnL{" "}
                    <span className={`font-GeistMono font-medium ${pnlClass(stat.pnl)}`}>
                      {fmtUsdCompact(stat.pnl, true)}
                    </span>{" "}
                    <span className={`font-GeistMono ${pnlClass(stat.roi)}`}>
                      ({fmtPctCompact(stat.roi)})
                    </span>
                  </span>
                ) : null}
                {data.stats.winRate !== null ? (
                  <span className="text-textTertiary">
                    Win Rate{" "}
                    <span className="font-GeistMono font-medium text-textPrimary">
                      {(data.stats.winRate * 100).toFixed(1)}%
                    </span>
                  </span>
                ) : null}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-[8px]">
              <PillAction
                label={tracked ? "Tracking ✓" : "Track Wallet"}
                icon={tracked ? "ri-eye-line" : "ri-eye-plus-line"}
                kind={tracked ? "ghost" : "blue"}
                onClick={() => {
                  if (tracked) removeWallet(data.address);
                  else addWallet(data.address, data.name ?? undefined);
                }}
              />
              <PillAction
                label="Copy Trade"
                icon="ri-magic-line"
                onClick={() => {
                  addWallet(data.address, data.name ?? undefined);
                  addCopy({
                    wallet: data.address.toLowerCase(),
                    label: data.name ?? undefined,
                    enabled: true,
                    sizing: "proportional",
                    fixedUsd: 500,
                    propPct: 10,
                    maxLev: 5,
                    longOnly: false,
                  });
                  onOpenCopier?.(data.address);
                }}
              />
              <button
                type="button"
                onClick={onClose}
                className="flex h-[26px] w-[26px] items-center justify-center rounded-[4px] text-textSecondary hover:bg-primaryStroke/60"
              >
                <i className="ri-close-line text-[16px]" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* charts */}
            <div className="grid grid-cols-1 gap-[12px] p-[12px] sm:p-[16px] lg:grid-cols-2">
              <div className="rounded-[8px] border border-primaryStroke bg-background/40 p-[10px]">
                <div className="mb-[4px] flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-textSecondary">PnL Curve</span>
                  <span className={`font-GeistMono text-[12px] ${pnlClass(pnlCurve.at(-1)?.[1])}`}>
                    {fmtUsdCompact(pnlCurve.at(-1)?.[1] ?? 0, true)}
                  </span>
                </div>
                <AreaChart
                  data={pnlCurve}
                  color={(pnlCurve.at(-1)?.[1] ?? 0) >= 0 ? "#2FE3AC" : "#EC397A"}
                />
              </div>
              <div className="rounded-[8px] border border-primaryStroke bg-background/40 p-[10px]">
                <div className="mb-[4px] flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-textSecondary">Account Value</span>
                  <span className="font-GeistMono text-[12px] text-textPrimary">
                    {fmtUsdCompact(avCurve.at(-1)?.[1] ?? 0)}
                  </span>
                </div>
                <AreaChart data={avCurve} color="#5273FF" />
              </div>
            </div>

            {/* window selector + stat grid */}
            <div className="flex flex-col gap-[10px] px-[12px] pb-[6px] sm:px-[16px]">
              <div className="flex items-center gap-[4px]">
                {(Object.keys(WIN_LABEL) as Win[]).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setWin(w)}
                    className={`h-[24px] rounded-[4px] px-[8px] text-[12px] font-medium ${
                      win === w
                        ? "bg-primaryStroke/60 text-textPrimary"
                        : "text-textTertiary hover:bg-primaryStroke/40 hover:text-textSecondary"
                    }`}
                  >
                    {WIN_LABEL[w]}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-[8px] sm:grid-cols-4">
                {(
                  [
                    ["Closed Trades", data.stats.closedTrades.toLocaleString(), ""],
                    ["Win / Loss", `${data.stats.wins} / ${data.stats.losses}`, ""],
                    ["Realized PnL", fmtUsdCompact(data.stats.realized, true), pnlClass(data.stats.realized)],
                    ["Volume", fmtUsdCompact(data.stats.volume), ""],
                    ["Avg Win", fmtUsdCompact(data.stats.avgWin), "text-increase"],
                    ["Avg Loss", fmtUsdCompact(data.stats.avgLoss), "text-decrease"],
                    ["Biggest Win", fmtUsdCompact(data.stats.biggestWin), "text-increase"],
                    ["Biggest Loss", fmtUsdCompact(data.stats.biggestLoss), "text-decrease"],
                    ["Fees Paid", fmtUsdCompact(data.stats.fees), ""],
                    ["Bias", `${data.stats.longs}L / ${data.stats.shorts}S`, ""],
                    ["24h ROI", stat ? fmtPctCompact(stat.roi) : "—", stat ? pnlClass(stat.roi) : ""],
                    ["7d PnL", data.lb ? fmtUsdCompact(data.lb.week.pnl, true) : "—", data.lb ? pnlClass(data.lb.week.pnl) : ""],
                  ] as [string, string, string][]
                ).map(([label, value, cls]) => (
                  <div key={label} className="rounded-[8px] border border-primaryStroke bg-background/40 px-[10px] py-[8px]">
                    <div className="text-[11px] text-textTertiary">{label}</div>
                    <div className={`font-GeistMono text-[14px] font-medium ${cls || "text-textPrimary"}`}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* positions */}
            {data.state?.positions.length ? (
              <div className="px-[12px] pt-[10px] sm:px-[16px]">
                <div className="mb-[6px] text-[12px] font-semibold uppercase tracking-[0.04em] text-textTertiary">
                  Open Positions ({data.state.positions.length})
                </div>
                <div className="overflow-x-auto rounded-[8px] border border-primaryStroke">
                  <div className="min-w-[480px]">
                    <div className="grid grid-cols-[1.2fr_1fr_1fr_0.9fr_0.9fr] bg-primaryStroke/25 px-[10px] py-[6px] text-[11px] text-textTertiary">
                      <span>Coin</span>
                      <span>Size</span>
                      <span>Entry</span>
                      <span>Value</span>
                      <span>PnL (ROE)</span>
                    </div>
                    {data.state.positions.map((p) => (
                      <div
                        key={p.coin}
                        className="grid grid-cols-[1.2fr_1fr_1fr_0.9fr_0.9fr] items-center border-t border-primaryStroke/60 px-[10px] py-[6px] text-[12px] font-GeistMono"
                      >
                        <span className="flex items-center gap-[6px] font-sans">
                          <CoinChip coin={p.coin} />
                          <span className="text-[10px] text-textTertiary">{p.lev}x</span>
                        </span>
                        <span className={p.szi > 0 ? "text-increase" : "text-decrease"}>
                          {p.szi > 0 ? "+" : ""}
                          {p.szi.toPrecision(6)}
                        </span>
                        <span className="text-textSecondary">{p.entryPx.toPrecision(6)}</span>
                        <span className="text-textSecondary">{fmtUsdCompact(p.value)}</span>
                        <span className={pnlClass(p.unrealizedPnl)}>
                          {fmtUsdCompact(p.unrealizedPnl, true)} ({fmtPctCompact(p.roe)})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {/* coins breakdown + big trades */}
            <div className="grid grid-cols-1 gap-[16px] p-[12px] sm:p-[16px] lg:grid-cols-2">
              <div>
                <div className="mb-[6px] text-[12px] font-semibold uppercase tracking-[0.04em] text-textTertiary">
                  Coin Breakdown (volume)
                </div>
                <div className="flex flex-col gap-[6px]">
                  {data.stats.coins.slice(0, 8).map((c) => {
                    const max = data.stats.coins[0]?.vol || 1;
                    return (
                      <div key={c.coin} className="flex items-center gap-[8px]">
                        <span className="w-[64px] shrink-0">
                          <CoinChip coin={c.coin} />
                        </span>
                        <div className="h-[8px] min-w-0 flex-1 overflow-hidden rounded-[4px] bg-primaryStroke/40">
                          <div
                            className="h-full rounded-[4px] bg-primaryBlue/70"
                            style={{ width: `${Math.max(3, (c.vol / max) * 100)}%` }}
                          />
                        </div>
                        <span className="w-[58px] shrink-0 text-right font-GeistMono text-[11px] text-textSecondary">
                          {fmtUsdCompact(c.vol)}
                        </span>
                        <span className={`w-[58px] shrink-0 text-right font-GeistMono text-[11px] ${pnlClass(c.pnl)}`}>
                          {fmtUsdCompact(c.pnl, true)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="mb-[6px] text-[12px] font-semibold uppercase tracking-[0.04em] text-textTertiary">
                  Biggest Trades
                </div>
                <div className="flex flex-col gap-[4px]">
                  {data.bigTrades.slice(0, 8).map((t, i) => (
                    <div key={i} className="flex items-center justify-between gap-[8px] rounded-[6px] bg-primaryStroke/20 px-[8px] py-[5px] text-[12px]">
                      <span className="flex items-center gap-[6px]">
                        <CoinChip coin={t.coin} size={14} />
                        <span className={`rounded-full px-[6px] text-[10px] font-medium ${t.side === "B" ? "bg-increase/15 text-increase" : "bg-decrease/15 text-decrease"}`}>
                          {t.dir}
                        </span>
                      </span>
                      <span className="font-GeistMono text-textSecondary">@ {t.px.toPrecision(6)}</span>
                      <span className="font-GeistMono font-medium text-textPrimary">{fmtUsdCompact(t.usd)}</span>
                      <span className="w-[40px] text-right font-GeistMono text-[10px] text-textTertiary">{ageStr(t.t)}</span>
                      <span className={`w-[56px] text-right font-GeistMono ${pnlClass(t.pnl)}`}>
                        {t.pnl !== null ? fmtUsdCompact(t.pnl, true) : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* fills tape */}
            <div className="px-[12px] pb-[16px] sm:px-[16px]">
              <div className="mb-[6px] text-[12px] font-semibold uppercase tracking-[0.04em] text-textTertiary">
                Recent Fills ({data.fills.length})
              </div>
              <div className="max-h-[220px] overflow-y-auto overflow-x-auto rounded-[8px] border border-primaryStroke">
                <div className="min-w-[480px]">
                  {data.fills.slice(0, 120).map((f, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[70px_1fr_90px_80px_90px_90px] items-center gap-[6px] border-b border-primaryStroke/40 px-[10px] py-[5px] text-[11px] last:border-0"
                    >
                      <span className="text-textTertiary">{ageStr(f.time)}</span>
                      <span className="flex items-center gap-[6px]">
                        <CoinChip coin={f.coin} size={14} />
                        <span className={`rounded-full px-[5px] text-[10px] font-medium ${f.dir.startsWith("Open") ? (f.side === "B" ? "bg-increase/15 text-increase" : "bg-decrease/15 text-decrease") : "bg-primaryStroke/50 text-textSecondary"}`}>
                          {f.dir}
                        </span>
                      </span>
                      <span className="text-right font-GeistMono text-textSecondary">{(+f.px).toPrecision(6)}</span>
                      <span className="text-right font-GeistMono text-textSecondary">{(+f.sz).toPrecision(4)}</span>
                      <span className="text-right font-GeistMono text-textPrimary">{fmtUsdCompact(+f.px * +f.sz)}</span>
                      <span className={`text-right font-GeistMono ${pnlClass(+f.closedPnl)}`}>
                        {+f.closedPnl !== 0 ? fmtUsdCompact(+f.closedPnl, true) : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </TrackerModal>
  );
}
