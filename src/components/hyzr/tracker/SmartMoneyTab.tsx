"use client";
/**
 * Smart Money — the ranked Hyperliquid wallet universe (real leaderboard,
 * day/week/month/allTime PnL, ROI, volume) + whale-positioning table
 * (what the top 100 wallets are actually long/short right now).
 */
import { useEffect, useMemo, useState } from "react";
import {
  WalletAvatar,
  WalletLabel,
  PillAction,
  CoinChip,
  pnlClass,
  fmtUsdCompact,
  fmtPctCompact,
} from "./bits";
import { useTrackerStore } from "@/lib/tracker/trackerStore";
import { toast } from "@/lib/hyperliquid/tradeStore";
import { checkPositioningAlert } from "@/lib/tracker/useTrackerStream";
import { baseName } from "@/lib/hyperliquid/types";

type Win = "day" | "week" | "month" | "allTime";
type Sort = "pnl" | "roi" | "vlm" | "av";
const WIN_LABEL: Record<Win, string> = { day: "1D", week: "1W", month: "1M", allTime: "All" };

interface LbRow {
  address: string;
  name: string | null;
  av: number;
  pnl: number;
  roi: number;
  vlm: number;
}

export default function SmartMoneyTab({
  onOpenWallet,
}: {
  onOpenWallet: (addr: string) => void;
}) {
  const [sub, setSub] = useState<"leaderboard" | "positioning">("leaderboard");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[44px] shrink-0 items-center gap-[8px] border-b border-primaryStroke px-[16px]">
        <div className="flex h-[28px] items-center gap-[2px] rounded-full bg-primaryStroke/40 p-[3px]">
          {(["leaderboard", "positioning"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSub(s)}
              className={`flex h-[22px] items-center gap-[5px] rounded-full px-[10px] text-[12px] font-medium capitalize transition-colors ${
                sub === s ? "bg-primaryStroke text-textPrimary" : "text-textTertiary hover:text-textSecondary"
              }`}
            >
              <i className={s === "leaderboard" ? "ri-trophy-line text-[13px]" : "ri-pie-chart-2-line text-[13px]"} />
              {s}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-textTertiary">
          {sub === "leaderboard"
            ? "Every Hyperliquid wallet ranked by real PnL"
            : "Live positioning of the top 100 wallets by 24h PnL"}
        </span>
      </div>
      {sub === "leaderboard" ? <Leaderboard onOpenWallet={onOpenWallet} /> : <Positioning />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Leaderboard({ onOpenWallet }: { onOpenWallet: (addr: string) => void }) {
  const wallets = useTrackerStore((s) => s.wallets);
  const addWallet = useTrackerStore((s) => s.addWallet);
  const removeWallet = useTrackerStore((s) => s.removeWallet);
  const addCopy = useTrackerStore((s) => s.addCopy);
  const [win, setWin] = useState<Win>("day");
  const [sort, setSort] = useState<Sort>("pnl");
  const [minPnl, setMinPnl] = useState("");
  const [minAv, setMinAv] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<LbRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const LIMIT = 50;

  const load = (off: number, append: boolean) => {
    setLoading(true);
    const sp = new URLSearchParams({
      window: win,
      sort,
      limit: String(LIMIT),
      offset: String(off),
    });
    if (minPnl) sp.set("minPnl", minPnl);
    if (minAv) sp.set("minAv", minAv);
    if (q) sp.set("q", q);
    fetch(`/api/tracker/leaderboard?${sp}`)
      .then((r) => r.json())
      .then((j: { rows: LbRow[]; total: number }) => {
        setRows((prev) => (append ? [...prev, ...j.rows] : j.rows));
        setTotal(j.total);
        setOffset(off);
      })
      // graceful: on a transient failure keep the last-known rows instead of
      // blanking the table or raising an unhandled rejection
      .catch(() => undefined)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const t = setTimeout(() => load(0, false), 250);
    return () => clearTimeout(t);
  }, [win, sort, minPnl, minAv, q]);

  const trackedSet = useMemo(() => new Set(wallets.map((w) => w.address)), [wallets]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-[50px] shrink-0 flex-wrap items-center gap-[6px] border-b border-primaryStroke px-[10px] py-[6px] sm:h-[50px] sm:flex-nowrap sm:gap-[8px] sm:px-[16px] sm:py-0">
        <div className="flex h-[28px] items-center gap-[2px] rounded-full bg-primaryStroke/40 p-[3px]">
          {(Object.keys(WIN_LABEL) as Win[]).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWin(w)}
              className={`h-[22px] rounded-full px-[9px] text-[12px] font-medium transition-colors sm:px-[10px] ${
                win === w ? "bg-primaryStroke text-textPrimary" : "text-textTertiary hover:text-textSecondary"
              }`}
            >
              {WIN_LABEL[w]}
            </button>
          ))}
        </div>
        <div className="flex h-[28px] items-center gap-[2px] rounded-full bg-primaryStroke/40 p-[3px]">
          {(
            [
              ["pnl", "PnL"],
              ["roi", "ROI"],
              ["vlm", "Volume"],
              ["av", "Net Worth"],
            ] as [Sort, string][]
          ).map(([s, label]) => (
            <button
              key={s}
              type="button"
              onClick={() => setSort(s)}
              className={`h-[22px] rounded-full px-[8px] text-[11px] font-medium transition-colors sm:px-[9px] ${
                sort === s ? "bg-primaryStroke text-textPrimary" : "text-textTertiary hover:text-textSecondary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          value={minPnl}
          onChange={(e) => setMinPnl(e.target.value.replace(/[^0-9.-]/g, ""))}
          placeholder="Min PnL $"
          className="h-[28px] w-[84px] rounded-full border border-primaryStroke bg-transparent px-[9px] font-GeistMono text-[12px] text-textPrimary outline-none placeholder:font-sans placeholder:text-textTertiary sm:w-[96px] sm:px-[10px]"
        />
        <input
          value={minAv}
          onChange={(e) => setMinAv(e.target.value.replace(/[^0-9.-]/g, ""))}
          placeholder="Min Net Worth $"
          className="hidden h-[28px] w-[120px] rounded-full border border-primaryStroke bg-transparent px-[10px] font-GeistMono text-[12px] text-textPrimary outline-none placeholder:font-sans placeholder:text-textTertiary md:block"
        />
        <div className="flex h-[28px] w-[130px] items-center gap-[6px] rounded-full border border-primaryStroke px-[10px] lg:w-[210px]">
          <i className="ri-search-line text-[13px] text-textTertiary" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search address or name…"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-textPrimary outline-none placeholder:text-textTertiary"
          />
        </div>
        <span className="ml-auto hidden text-[11px] text-textTertiary md:block">{total.toLocaleString()} wallets</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-[1] flex h-[30px] items-center border-b border-primaryStroke bg-background px-[10px] text-[12px] text-textTertiary sm:px-[16px]">
          <span className="w-[32px] sm:w-[44px]">#</span>
          <span className="min-w-[130px] flex-1 sm:min-w-[190px]">Wallet</span>
          <span className="hidden w-[110px] text-right md:block">Net Worth</span>
          <span className="w-[96px] text-right sm:w-[110px]">{WIN_LABEL[win]} PnL</span>
          <span className="w-[68px] text-right sm:w-[92px]">ROI</span>
          <span className="hidden w-[110px] text-right xl:block">Volume</span>
          <span className="w-[76px] shrink-0 lg:w-[168px]" />
        </div>
        {rows.map((r, i) => (
          <div
            key={r.address}
            className="group flex h-[42px] cursor-pointer items-center border-b border-primaryStroke/30 px-[10px] transition-colors hover:bg-primaryStroke/20 sm:px-[16px]"
            onClick={() => onOpenWallet(r.address)}
          >
            <span className="w-[32px] font-GeistMono text-[12px] text-textTertiary sm:w-[44px]">{offset + i + 1}</span>
            <span className="flex min-w-[130px] flex-1 items-center gap-[9px] sm:min-w-[190px]">
              <WalletAvatar address={r.address} size={26} rounded="rounded-[7px]" />
              <WalletLabel address={r.address} name={r.name} />
              {trackedSet.has(r.address) ? (
                <span className="hidden h-[16px] shrink-0 items-center rounded-full bg-increase/15 px-[6px] text-[9px] font-bold uppercase text-increase sm:flex">
                  tracking
                </span>
              ) : null}
            </span>
            <span className="hidden w-[110px] text-right font-GeistMono text-[12px] text-textPrimary md:block">
              {fmtUsdCompact(r.av)}
            </span>
            <span className={`w-[96px] text-right font-GeistMono text-[13px] font-medium sm:w-[110px] ${pnlClass(r.pnl)}`}>
              {fmtUsdCompact(r.pnl, true)}
            </span>
            <span className={`w-[68px] text-right font-GeistMono text-[12px] sm:w-[92px] ${pnlClass(r.roi)}`}>
              {fmtPctCompact(r.roi)}
            </span>
            <span className="hidden w-[110px] text-right font-GeistMono text-[12px] text-textSecondary xl:block">
              {fmtUsdCompact(r.vlm)}
            </span>
            <span className="flex w-[76px] shrink-0 items-center justify-end gap-[5px] lg:w-[168px]">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (trackedSet.has(r.address)) removeWallet(r.address);
                  else if (addWallet(r.address, r.name ?? undefined)) toast("Wallet tracked", "success");
                }}
                title={trackedSet.has(r.address) ? "Stop tracking" : "Track wallet"}
                className={`flex h-[24px] items-center justify-center gap-[4px] rounded-full px-[7px] text-[11px] font-medium lg:px-[9px] ${
                  trackedSet.has(r.address)
                    ? "bg-increase/15 text-increase"
                    : "bg-primaryStroke text-textSecondary hover:bg-secondaryStroke"
                }`}
              >
                <i className={trackedSet.has(r.address) ? "ri-eye-line text-[12px]" : "ri-eye-plus-line text-[12px]"} />
                <span className="hidden lg:inline">{trackedSet.has(r.address) ? "Tracking" : "Track"}</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  addWallet(r.address, r.name ?? undefined);
                  addCopy({
                    wallet: r.address,
                    label: r.name ?? undefined,
                    enabled: true,
                    sizing: "proportional",
                    fixedUsd: 500,
                    propPct: 10,
                    maxLev: 5,
                    longOnly: false,
                  });
                  toast(`Copy trading ${r.name ?? r.address.slice(0, 6)} — see Copy Trading tab`, "success");
                  document.dispatchEvent(new CustomEvent("tracker-goto-copy"));
                }}
                title="Copy trade this wallet"
                className="flex h-[24px] items-center justify-center gap-[4px] rounded-full bg-primaryBlue/20 px-[7px] text-[11px] font-medium text-primaryBlue hover:bg-primaryBlue/30 lg:px-[9px]"
              >
                <i className="ri-magic-line text-[12px]" />
                <span className="hidden lg:inline">Copy</span>
              </button>
            </span>
          </div>
        ))}
        {rows.length < total ? (
          <div className="flex justify-center py-[14px]">
            <PillAction
              label={loading ? "Loading…" : `Load more (${total - rows.length} left)`}
              onClick={() => load(offset + LIMIT, true)}
            />
          </div>
        ) : null}
        {!rows.length && loading ? (
          <div className="flex h-[160px] items-center justify-center">
            <div className="h-[26px] w-[26px] animate-spin rounded-full border-[2px] border-primaryStroke border-t-primaryBlue" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface SmCoin {
  coin: string;
  longs: number;
  shorts: number;
  longUsd: number;
  shortUsd: number;
  top: { w: string; usd: number; szi: number }[];
}

function Positioning() {
  const [data, setData] = useState<{ updatedAt: number; coins: SmCoin[] } | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/tracker/smartmoney")
        .then((r) => r.json())
        .then((j) => {
          if (alive) {
            setData(j);
            for (const c of (j.coins ?? []).slice(0, 10)) {
              const tot = c.longUsd + c.shortUsd;
              if (tot > 0) checkPositioningAlert(c.coin, (c.longUsd / tot) * 100);
            }
          }
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 12_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const coins = useMemo(() => {
    if (!data) return [];
    const query = q.trim().toUpperCase();
    return query ? data.coins.filter((c) => c.coin.toUpperCase().includes(query)) : data.coins;
  }, [data, q]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex h-[46px] items-center gap-[10px] border-b border-primaryStroke px-[16px]">
        <div className="flex h-[28px] w-[200px] items-center gap-[6px] rounded-full border border-primaryStroke px-[10px]">
          <i className="ri-search-line text-[13px] text-textTertiary" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter coin…"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-textPrimary outline-none placeholder:text-textTertiary"
          />
        </div>
        <span className="text-[11px] text-textTertiary">
          {data?.updatedAt
            ? `Updated ${Math.max(0, Math.round((Date.now() - data.updatedAt) / 1000))}s ago · rolling snapshot of the top 100 wallets`
            : "Sampling the top 100 wallets…"}
        </span>
      </div>
      {!coins.length ? (
        <div className="flex h-[200px] flex-col items-center justify-center gap-[10px]">
          <div className="h-[24px] w-[24px] animate-spin rounded-full border-[2px] border-primaryStroke border-t-primaryBlue" />
          <span className="text-[12px] text-textTertiary">
            Building the whale positioning snapshot (takes ~2 min on first load)
          </span>
        </div>
      ) : (
        coins.map((c) => {
          const total = c.longUsd + c.shortUsd;
          const longPct = total > 0 ? (c.longUsd / total) * 100 : 50;
          return (
            <div key={c.coin} className="flex items-center gap-[14px] border-b border-primaryStroke/30 px-[16px] py-[9px]">
              <span className="w-[110px] shrink-0">
                <CoinChip coin={c.coin} size={17} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <div className="flex h-[9px] w-full overflow-hidden rounded-full">
                  <div className="h-full bg-increase/80" style={{ width: `${longPct}%` }} />
                  <div className="h-full bg-decrease/80" style={{ width: `${100 - longPct}%` }} />
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-increase">
                    {longPct.toFixed(0)}% long · {fmtUsdCompact(c.longUsd)}
                  </span>
                  <span className="text-decrease">
                    {(100 - longPct).toFixed(0)}% short · {fmtUsdCompact(c.shortUsd)}
                  </span>
                </div>
              </div>
              <span className="hidden w-[86px] shrink-0 text-right font-GeistMono text-[11px] text-textTertiary sm:block">
                {c.longs}L / {c.shorts}S
              </span>
              <div className="hidden w-[190px] shrink-0 items-center justify-end gap-[5px] xl:flex">
                {c.top.slice(0, 3).map((t) => (
                  <button
                    key={t.w}
                    type="button"
                    className="flex items-center gap-[4px] rounded-full bg-primaryStroke/40 px-[6px] py-[2px] text-[10px] text-textSecondary hover:bg-primaryStroke/70"
                    title={`${baseName(c.coin)} position ${fmtUsdCompact(t.usd)}`}
                  >
                    <span
                      className={`h-[6px] w-[6px] rounded-full ${t.szi > 0 ? "bg-increase" : "bg-decrease"}`}
                    />
                    {t.w.slice(0, 5)}…{t.w.slice(-3)}
                    <span className="font-GeistMono">{fmtUsdCompact(t.usd)}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
