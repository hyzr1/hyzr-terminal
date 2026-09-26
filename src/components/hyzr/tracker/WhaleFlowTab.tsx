"use client";
/**
 * Whale Flow — live money stream from the best wallets on Hyperliquid.
 * fx22 rebuild: the feed is CHRONOLOGICAL (newest first — the SSE poller
 * delivers per-wallet batches out of order, which read as "not sorted at
 * all"), the per-coin flow chips scroll clean (no browser scrollbar), and
 * the toolbar carries real filters: min size · side · open/close ·
 * source (whales/tracked) · time window · sort · coin search. Rows sit on a
 * fixed column grid with a header, so the feed reads like a terminal.
 */
import { useMemo, useState } from "react";
import type { WhaleEvent } from "@/lib/tracker/tracker-types";
import { useFeedStore } from "@/lib/tracker/useTrackerStream";
import { useTrackerStore, shortAddr } from "@/lib/tracker/trackerStore";
import { WalletAvatar, CoinChip, pnlClass, fmtUsdCompact, ageStr } from "./bits";
import { baseName } from "@/lib/hyperliquid/types";
import { useClock } from "@/hooks/use-clock";

const SIZE_STEPS = [10_000, 50_000, 100_000, 250_000, 1_000_000, 5_000_000];
const WINDOWS: Array<[string, number]> = [
  ["15m", 15 * 60_000],
  ["1h", 60 * 60_000],
  ["6h", 6 * 60 * 60_000],
  ["All", Number.MAX_SAFE_INTEGER],
];

function actionOf(dir: string): { kind: "open" | "close" | "flip"; label: string } {
  if (dir.startsWith("Open")) return { kind: "open", label: dir };
  if (dir.startsWith("Close")) return { kind: "close", label: dir };
  if (dir.includes(">")) return { kind: "flip", label: dir };
  return { kind: "close", label: dir || "Fill" };
}

/* one labeled pill group (size · side · type · source · window · sort) */
function PillGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex h-[28px] shrink-0 items-center gap-[2px] rounded-full bg-primaryStroke/40 p-[3px]">{children}</div>;
}
function Pill({
  active,
  onClick,
  children,
  tone = "default",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "default" | "buy" | "sell";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-[22px] whitespace-nowrap rounded-full px-[9px] text-[11px] font-medium transition-colors ${
        active
          ? tone === "buy"
            ? "bg-increase/20 text-increase"
            : tone === "sell"
              ? "bg-decrease/20 text-decrease"
              : "bg-primaryStroke text-textPrimary"
          : "text-textTertiary hover:text-textSecondary"
      }`}
    >
      {children}
    </button>
  );
}

export default function WhaleFlowTab({
  onOpenWallet,
}: {
  onOpenWallet: (addr: string) => void;
}) {
  const events = useFeedStore((s) => s.events);
  const connected = useFeedStore((s) => s.connected);
  const feed = useTrackerStore((s) => s.feed);
  const setFeed = useTrackerStore((s) => s.setFeed);
  const [coinFilter, setCoinFilter] = useState("");
  const [sideFilter, setSideFilter] = useState<"both" | "buy" | "sell">("both");
  const [win, setWin] = useState<number>(15 * 60_000); // feed window (summary stays 15m)
  const [sort, setSort] = useState<"new" | "size">("new");
  const now = useClock(); // SSR-safe 1 Hz clock for event ages

  const filtered = useMemo(() => {
    const coinQ = coinFilter.trim().toUpperCase();
    const cutoff = Date.now() - (Number.isFinite(win) ? win : 0);
    const list = events.filter((ev) => {
      if (ev.usd < feed.minUsd) return false;
      if (feed.k.length && !feed.k.includes(ev.k)) return false;
      if (feed.types.length && !feed.types.includes(actionOf(ev.dir).kind as "open" | "close")) return false;
      if (coinQ && !ev.coin.toUpperCase().includes(coinQ)) return false;
      if (sideFilter === "buy" && ev.side !== "B") return false;
      if (sideFilter === "sell" && ev.side !== "A") return false;
      if (ev.t < cutoff) return false;
      return true;
    });
    /* fx22: chronological newest-first (the poller's batch order is per-wallet,
       not per-time — the old display inherited it and read as unsorted junk) */
    return sort === "new" ? list.sort((a, b) => b.t - a.t || b.tid - a.tid) : list.sort((a, b) => b.usd - a.usd);
  }, [events, feed, coinFilter, sideFilter, win, sort]);

  // money-flow summary over the last 15 minutes (from ALL events, unfiltered by size)
  const flow = useMemo(() => {
    const cutoff = Date.now() - 15 * 60_000;
    let buy = 0;
    let sell = 0;
    const perCoin = new Map<string, number>();
    for (const ev of events) {
      if (ev.t < cutoff) continue;
      const signed = ev.side === "B" ? ev.usd : -ev.usd;
      if (ev.side === "B") buy += ev.usd;
      else sell += ev.usd;
      perCoin.set(ev.coin, (perCoin.get(ev.coin) ?? 0) + signed);
    }
    const coins = [...perCoin.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6);
    return { buy, sell, coins };
  }, [events]);

  const topCoins = flow.coins;
  const maxFlow = Math.max(1, ...topCoins.map(([, v]) => Math.abs(v)));

  const typeMode: "all" | "open" | "close" =
    feed.types.length === 1 ? feed.types[0] : "all";
  const srcMode: "all" | "whale" | "tracked" =
    feed.k.length === 1 ? feed.k[0] : "all";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── filter toolbar ── */}
      <div className="flex shrink-0 flex-wrap items-center gap-[6px] border-b border-primaryStroke px-[10px] py-[7px] sm:gap-[8px] sm:px-[16px]">
        <PillGroup>
          {SIZE_STEPS.map((s) => (
            <Pill key={s} active={feed.minUsd === s} onClick={() => setFeed({ minUsd: s })}>
              {fmtUsdCompact(s)}
            </Pill>
          ))}
        </PillGroup>

        <PillGroup>
          <Pill active={sideFilter === "both"} onClick={() => setSideFilter("both")}>All sides</Pill>
          <Pill active={sideFilter === "buy"} tone="buy" onClick={() => setSideFilter("buy")}>Buying</Pill>
          <Pill active={sideFilter === "sell"} tone="sell" onClick={() => setSideFilter("sell")}>Selling</Pill>
        </PillGroup>

        <PillGroup>
          <Pill active={typeMode === "all"} onClick={() => setFeed({ types: ["open", "close"] })}>All actions</Pill>
          <Pill active={typeMode === "open"} onClick={() => setFeed({ types: ["open"] })}>Opens</Pill>
          <Pill active={typeMode === "close"} onClick={() => setFeed({ types: ["close"] })}>Closes</Pill>
        </PillGroup>

        <PillGroup>
          <Pill active={srcMode === "all"} onClick={() => setFeed({ k: ["whale", "tracked"] })}>All whales</Pill>
          <Pill active={srcMode === "whale"} onClick={() => setFeed({ k: ["whale"] })}>Scanner</Pill>
          <Pill active={srcMode === "tracked"} onClick={() => setFeed({ k: ["tracked"] })}>Tracked</Pill>
        </PillGroup>

        <PillGroup>
          {WINDOWS.map(([label, ms]) => (
            <Pill key={label} active={win === ms} onClick={() => setWin(ms)}>{label}</Pill>
          ))}
        </PillGroup>

        <PillGroup>
          <Pill active={sort === "new"} onClick={() => setSort("new")}>Newest</Pill>
          <Pill active={sort === "size"} onClick={() => setSort("size")}>Largest</Pill>
        </PillGroup>

        <div className="flex h-[28px] w-[140px] shrink-0 items-center gap-[6px] rounded-full border border-primaryStroke px-[10px]">
          <i className="ri-search-line text-[13px] text-textTertiary" />
          <input
            value={coinFilter}
            onChange={(e) => setCoinFilter(e.target.value)}
            placeholder="Coin…"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-textPrimary outline-none placeholder:text-textTertiary"
          />
        </div>

        <div className="ml-auto flex items-center gap-[8px] text-[11px] text-textTertiary">
          <span className={`flex items-center gap-[5px] ${connected ? "text-increase" : "text-decrease"}`}>
            <span className={`h-[6px] w-[6px] rounded-full ${connected ? "animate-pulse bg-increase" : "bg-decrease"}`} />
            {connected ? "LIVE" : "reconnecting…"}
          </span>
          <span>{filtered.length} events</span>
        </div>
      </div>

      {/* ── money-flow summary ── */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-[16px] gap-y-[6px] border-b border-primaryStroke px-[10px] py-[8px] sm:px-[16px]">
        <div className="flex items-center gap-[8px]">
          <span className="text-[11px] uppercase tracking-[0.04em] text-textTertiary">15m Flow</span>
          <span className="font-GeistMono text-[12px] font-medium text-increase">{fmtUsdCompact(flow.buy)}</span>
          <span className="text-[10px] text-textTertiary">in /</span>
          <span className="font-GeistMono text-[12px] font-medium text-decrease">{fmtUsdCompact(flow.sell)}</span>
          <span className="text-[10px] text-textTertiary">out</span>
        </div>
        {/* fx22: no-scrollbar — the raw horizontal scrollbar read as broken UI */}
        <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-[10px] overflow-x-auto">
          {topCoins.map(([coin, net]) => (
            <button
              key={coin}
              type="button"
              title={`Filter feed by ${baseName(coin)}`}
              onClick={() => setCoinFilter(baseName(coin) === coinFilter ? "" : baseName(coin))}
              className={`flex shrink-0 items-center gap-[6px] rounded-full px-[8px] py-[3px] transition-colors ${
                coinFilter === baseName(coin) ? "bg-primaryBlue/25 ring-1 ring-primaryBlue/50" : "bg-primaryStroke/30 hover:bg-primaryStroke/60"
              }`}
            >
              <CoinChip coin={coin} size={13} />
              <div className="flex h-[5px] w-[54px] overflow-hidden rounded-full bg-primaryStroke/50">
                <div
                  className={`h-full rounded-full ${net >= 0 ? "bg-increase" : "bg-decrease"}`}
                  style={{ width: `${Math.max(6, (Math.abs(net) / maxFlow) * 100)}%` }}
                />
              </div>
              <span className={`font-GeistMono text-[11px] ${pnlClass(net)}`}>{fmtUsdCompact(net, true)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── feed column header (desktop) ── */}
      <div className="hidden h-[26px] shrink-0 items-center gap-[10px] border-b border-primaryStroke/60 px-[16px] text-[9.5px] font-semibold uppercase tracking-[0.08em] text-textTertiary/80 sm:flex">
        <span className="w-[42px] shrink-0">Time</span>
        <span className="w-[120px] shrink-0">Wallet</span>
        <span className="w-[120px] shrink-0">Action</span>
        <span className="w-[86px] shrink-0">Coin</span>
        <span className="hidden w-[90px] shrink-0 text-right lg:block">Price</span>
        <span className="hidden w-[86px] shrink-0 text-right xl:block">Size</span>
        <span className="w-[86px] shrink-0 text-right">Value</span>
        <span className="w-[80px] shrink-0 text-right">P&amp;L</span>
        <span className="ml-auto w-[56px] shrink-0 text-right">Type</span>
      </div>

      {/* ── feed ── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-[240px] flex-col items-center justify-center gap-[10px]">
            <i className="ri-flow-chart text-[26px] text-textTertiary" />
            <span className="text-[13px] text-textTertiary">
              Waiting for whale flow ≥ {fmtUsdCompact(feed.minUsd)}…
            </span>
            <span className="text-[11px] text-textTertiary/70">
              The scanner polls the best Hyperliquid wallets continuously — first events land within a minute.
            </span>
          </div>
        ) : (
          filtered.slice(0, 150).map((ev) => (
            <FlowRow key={`${ev.w}:${ev.tid}`} ev={ev} onOpenWallet={onOpenWallet} now={now} />
          ))
        )}
      </div>
    </div>
  );
}

function FlowRow({
  ev,
  onOpenWallet,
  now,
}: {
  ev: WhaleEvent;
  onOpenWallet: (addr: string) => void;
  now: number;
}) {
  const act = actionOf(ev.dir);
  const isBuy = ev.side === "B";
  void now;
  return (
    <div
      className="flex cursor-pointer flex-col gap-[2px] border-b border-primaryStroke/30 px-[12px] py-[7px] transition-colors hover:bg-primaryStroke/20 sm:h-[40px] sm:flex-row sm:items-center sm:gap-[10px] sm:px-[16px] sm:py-0"
      onClick={() => onOpenWallet(ev.w)}
    >
      {/* line 1 (mobile) / inline (desktop) */}
      <div className="flex w-full items-center gap-[8px] sm:contents">
        <span className="w-[34px] shrink-0 text-[11px] text-textTertiary sm:w-[42px]">{ageStr(ev.t)}</span>
        <span className="flex min-w-0 flex-1 items-center gap-[8px] sm:w-[120px] sm:flex-none">
          <WalletAvatar address={ev.w} size={22} rounded="rounded-[6px]" />
          <span className="truncate font-GeistMono text-[12px] text-textSecondary hover:text-textPrimary">
            {shortAddr(ev.w)}
          </span>
        </span>
        <span className={`ml-auto font-GeistMono text-[13px] font-medium sm:hidden ${isBuy ? "text-increase" : "text-decrease"}`}>
          {fmtUsdCompact(ev.usd)}
        </span>
      </div>
      {/* line 2 (mobile) / inline (desktop) — fixed column grid mirrors the header */}
      <div className="flex w-full items-center gap-[8px] sm:contents">
        <span
          className={`flex h-[20px] w-[120px] shrink-0 items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full px-[8px] text-[10px] font-semibold uppercase tracking-[0.02em] ${
            act.kind === "open"
              ? isBuy
                ? "bg-increase/15 text-increase"
                : "bg-decrease/15 text-decrease"
              : act.kind === "flip"
                ? "bg-primaryBlue/15 text-primaryBlue"
                : "bg-primaryStroke/60 text-textSecondary"
          }`}
        >
          {act.label}
        </span>
        <span className="flex w-[86px] shrink-0 items-center">
          <CoinChip coin={ev.coin} />
        </span>
        <span className="hidden w-[90px] shrink-0 text-right font-GeistMono text-[12px] text-textSecondary lg:block">
          {ev.px.toPrecision(6)}
        </span>
        <span className="hidden w-[86px] shrink-0 text-right font-GeistMono text-[12px] text-textSecondary xl:block">
          {ev.sz.toPrecision(4)} {baseName(ev.coin)}
        </span>
        <span className={`hidden w-[86px] shrink-0 text-right font-GeistMono text-[13px] font-medium sm:block ${isBuy ? "text-increase" : "text-decrease"}`}>
          {fmtUsdCompact(ev.usd)}
        </span>
        <span className={`w-[52px] shrink-0 text-right font-GeistMono text-[12px] sm:w-[80px] ${ev.pnl !== null ? pnlClass(ev.pnl) : "text-textTertiary/40"}`}>
          {ev.pnl !== null ? fmtUsdCompact(ev.pnl, true) : "—"}
        </span>
        <span className="hidden w-[56px] shrink-0 text-right text-[10px] uppercase text-textTertiary/70 sm:block">
          {ev.k === "tracked" ? "tracked" : ev.taker ? "taker" : "maker"}
        </span>
      </div>
    </div>
  );
}
