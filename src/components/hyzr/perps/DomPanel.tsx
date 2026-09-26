"use client";
/**
 * DomPanel (fx19) — the TopstepX/ProjectX DOM: a vertical price ladder
 * centered on the mark price.
 *   · bid size on the LEFT of the price column, ask size on the RIGHT,
 *     with depth bars growing outward from the center
 *   · the ladder is CONTINUOUS (every tick row around the mark), not just
 *     levels that happen to have liquidity — matching the real DOM
 *   · click a price level: bid side = BUY limit, ask side = SELL limit
 *     (TopstepX "click to trade"). Clicking a row that holds one of your
 *     working limit orders (same side + price) CANCELS it instead.
 *   · account realized P&L + unrealized P&L visible at the top of the panel
 *   · qty control (base units) drives the size of ladder-placed orders
 * mobile mode: a tap hands the price to the order sheet (pre-armed) instead
 * of placing directly — no accidental fat-finger orders on touch.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { usePerpsData, useCoinWatch } from "@/lib/hyperliquid/perpsStore";
import { baseName, type BookLevel } from "@/lib/hyperliquid/types";
import { fmtPrice } from "@/lib/hyperliquid/format";
import { useTradeStore, toast } from "@/lib/hyperliquid/tradeStore";
import { pickPrice } from "./pricePick";

const ROW_H = 22;
const ROW_H_TOUCH = 30;

export default function DomPanel({
  coin: coinProp,
  mode = "panel",
}: {
  coin?: string;
  /** panel = desktop (click-to-trade places directly) · mobile (tap arms the order sheet) */
  mode?: "panel" | "mobile";
}) {
  const storeCoin = usePerpsData((s) => s.coin);
  const coin = coinProp ?? storeCoin;
  useCoinWatch(coin); // l2Book + trades + ctx for THIS panel's market

  const book = usePerpsData((s) => s.books[coin]);
  const byName = usePerpsData((s) => s.byName);
  const mids = usePerpsData((s) => s.mids);
  const orders = useTradeStore((s) => s.orders);
  const cancelOrder = useTradeStore((s) => s.cancelOrder);
  const placeOrder = useTradeStore((s) => s.placeOrder);

  const meta = byName[coin]?.meta;
  const mid = mids[coin] ?? book?.bids[0]?.px ?? null;

  const [groupOpen, setGroupOpen] = useState(false);
  const [groupIdx, setGroupIdx] = useState(0);
  const groupRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [rowsPerSide, setRowsPerSide] = useState(9);
  const [flash, setFlash] = useState<{ px: number; side: "bid" | "ask"; at: number } | null>(null);

  /* qty state (base units) — resets sensibly per market */
  const [qty, setQty] = useState("");
  const [prevCoin, setPrevCoin] = useState(coin);
  if (prevCoin !== coin) {
    setPrevCoin(coin);
    setGroupIdx(0);
    setQty("");
  }
  const szDec = Math.min(meta?.szDecimals ?? 4, 6);
  /* step: ~0.01 for low-precision markets, down to 0.001 for 5-decimal ones
     (BTC szDec=5 → 0.001 · SOL szDec=2 → 1) */
  const qtyStep = 10 ** -Math.min(3, Math.max(0, (meta?.szDecimals ?? 2) - 2));
  const qtyNum = parseFloat(qty) || 0;
  /* empty qty → derive a sane default from a $100 notional — only once the
     market meta is known (szDecimals drives the step), recomputes on arrival */
  useEffect(() => {
    if (!meta || qty.trim() !== "" || mid == null || mid <= 0) return;
    const guess = Math.max(100 / mid, qtyStep);
    setQty(String(+guess.toFixed(szDec)));
  }, [coin, mid != null, !!meta]);

  /* grouping presets: raw tick + a few coarser steps */
  const tick = useMemo(() => {
    if (!meta) return 0.01;
    const maxDec = Math.max(0, 6 - meta.szDecimals);
    return 10 ** -maxDec;
  }, [meta]);
  const presets = useMemo(() => [tick, tick * 5, tick * 10, tick * 50, tick * 100], [tick]);
  const group = presets[Math.min(groupIdx, presets.length - 1)] ?? tick;

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (groupRef.current && !groupRef.current.contains(e.target as Node)) setGroupOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  /* visible row count tracks the panel height */
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const h = el.clientHeight;
      const rowH = mode === "mobile" ? ROW_H_TOUCH : ROW_H;
      setRowsPerSide(Math.max(3, Math.min(16, Math.floor((h - rowH) / 2 / rowH))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  /* grouped size maps keyed by bucket price */
  const { bidMap, askMap, bestBid, bestAsk } = useMemo(() => {
    const bidM = new Map<number, BookLevel>();
    const askM = new Map<number, BookLevel>();
    const bucket = (px: number) => Math.floor(px / group) * group;
    for (const l of book?.bids ?? []) {
      const k = bucket(l.px);
      const e = bidM.get(k);
      if (e) { e.sz += l.sz; e.n += l.n; } else bidM.set(k, { px: k, sz: l.sz, n: l.n });
    }
    for (const l of book?.asks ?? []) {
      const k = bucket(l.px);
      const e = askM.get(k);
      if (e) { e.sz += l.sz; e.n += l.n; } else askM.set(k, { px: k, sz: l.sz, n: l.n });
    }
    return {
      bidMap: bidM,
      askMap: askM,
      bestBid: book?.bids[0]?.px ?? null,
      bestAsk: book?.asks[0]?.px ?? null,
    };
  }, [book, group]);

  /* continuous ladder centered on the mark */
  const center = mid != null ? Math.round(mid / group) * group : null;
  const rows = useMemo(() => {
    if (center == null) return [];
    const out: Array<{ px: number; bid: number | null; ask: number | null }> = [];
    for (let i = rowsPerSide; i >= -rowsPerSide; i--) {
      const px = +(center + i * group).toFixed(10);
      const b = bidMap.get(px)?.sz ?? null;
      const a = askMap.get(px)?.sz ?? null;
      out.push({ px, bid: b, ask: a });
    }
    return out;
  }, [center, group, rowsPerSide, bidMap, askMap]);

  const maxSide = useMemo(() => {
    let mx = 0;
    for (const r of rows) {
      if (r.bid != null) mx = Math.max(mx, r.bid);
      if (r.ask != null) mx = Math.max(mx, r.ask);
    }
    return mx;
  }, [rows]);

  /* my working limit orders on this market, keyed by price+side */
  const myOrders = useMemo(() => {
    const m = new Map<string, { id: string; sz: number; isBuy: boolean }>();
    for (const o of orders) {
      if (o.coin !== coin || o.kind !== "Limit") continue;
      const key = `${o.isBuy ? "b" : "a"}:${o.px}`;
      const prev = m.get(key);
      if (!prev || o.sz > prev.sz) m.set(key, { id: o.id, sz: o.sz, isBuy: o.isBuy });
    }
    return m;
  }, [orders, coin]);

  const spreadAbs = bestAsk != null && bestBid != null ? bestAsk - bestBid : null;
  const spreadPct = spreadAbs != null && mid ? (spreadAbs / mid) * 100 : null;

  /* click-to-trade */
  const onRowClick = async (px: number, side: "bid" | "ask") => {
    if (mode === "mobile") {
      pickPrice(px, side === "ask" ? "ask" : "bid");
      return;
    }
    const isBuy = side === "bid";
    const own = myOrders.get(`${isBuy ? "b" : "a"}:${px}`);
    if (own) {
      cancelOrder(own.id);
      toast(`Limit order cancelled @ ${fmtPrice(meta, px)}`, "info");
      return;
    }
    if (!meta) {
      toast("Market data still loading — try again in a moment", "error");
      return;
    }
    if (!(qtyNum > 0)) {
      toast("Set a quantity first", "error");
      return;
    }
    const sz = +qtyNum.toFixed(szDec);
    if (!(sz > 0)) return;
    const res = await placeOrder({ coin, isBuy, sz, type: "limit", px, tif: "Gtc" });
    if (!res.ok && res.error) toast(res.error, "error");
    if (res.ok) {
      setFlash({ px, side, at: Date.now() });
      setTimeout(() => setFlash((f) => (f && f.px === px && f.side === side ? null : f)), 550);
    }
  };

  const rowH = mode === "mobile" ? ROW_H_TOUCH : ROW_H;
  const base = baseName(coin);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-backgroundSecondary">
      {/* ------- account P&L strip (TopstepX DOM header) ------- */}
      <PnlStrip />

      {/* ------- qty + grouping row ------- */}
      <div className="flex h-[34px] flex-shrink-0 flex-row items-center gap-[8px] border-b border-primaryStroke px-[10px]">
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-textTertiary">Qty</span>
        <div className="flex h-[24px] flex-row items-center overflow-hidden rounded-[6px] border border-primaryStroke bg-backgroundTertiary">
          <button
            onClick={() => setQty((q) => { const v = Math.max(qtyStep, (parseFloat(q) || 0) - qtyStep); return String(+v.toFixed(szDec)); })}
            className="flex h-full w-[24px] items-center justify-center text-[14px] leading-none text-textSecondary transition-colors hover:bg-primaryStroke/40 hover:text-textPrimary"
            aria-label="Decrease quantity"
          >
            −
          </button>
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            className="h-full w-[64px] bg-transparent text-center font-GeistMono text-[12px] text-textPrimary outline-none"
            aria-label="Order quantity"
          />
          <button
            onClick={() => setQty((q) => { const v = (parseFloat(q) || 0) + qtyStep; return String(+v.toFixed(szDec)); })}
            className="flex h-full w-[24px] items-center justify-center text-[14px] leading-none text-textSecondary transition-colors hover:bg-primaryStroke/40 hover:text-textPrimary"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
        <span className="text-[11px] font-medium text-textSecondary">{base}</span>

        <div className="ml-auto flex items-center gap-[6px]" ref={groupRef}>
          <span className="text-[10px] uppercase tracking-[0.06em] text-textTertiary">Tick</span>
          <button
            onClick={() => setGroupOpen((o) => !o)}
            className="flex h-[24px] cursor-pointer items-center gap-1 rounded-[6px] border border-primaryStroke bg-backgroundTertiary px-[8px] font-GeistMono text-[11px] text-textPrimary transition-colors hover:bg-primaryStroke/40"
          >
            {fmtPrice(meta, group)}
            <i className="ri-arrow-down-s-line text-[10px]" />
          </button>
          {groupOpen && (
            <div className="glass-pop pop-in absolute top-[64px] right-[8px] z-30 w-[110px] rounded-[8px] border border-white/10 p-[4px] shadow-dropdown">
              {presets.map((p, i) => (
                <button
                  key={i}
                  onClick={() => { setGroupIdx(i); setGroupOpen(false); }}
                  className={`flex w-full items-center rounded-[4px] px-[8px] py-[4px] text-left font-GeistMono text-[11px] ${
                    i === groupIdx ? "bg-primaryStroke/70 text-textPrimary" : "text-textSecondary hover:bg-primaryStroke/40"
                  }`}
                >
                  {fmtPrice(meta, p)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ------- the ladder ------- */}
      <div ref={bodyRef} className="relative flex min-h-0 flex-1 flex-col overflow-hidden font-GeistMono">
        {!book || center == null ? (
          <LadderSkeleton rowH={rowH} />
        ) : (
          <>
            {/* column captions */}
            <div className="flex h-[20px] flex-shrink-0 items-center px-[10px] text-[9px] uppercase tracking-[0.08em] text-textTertiary">
              <span className="flex-1 text-right">Bid</span>
              <span className="w-[86px] text-center">Price</span>
              <span className="flex-1 text-left">Ask</span>
            </div>
            <div className="flex flex-1 flex-col justify-center overflow-hidden">
              {rows.map((r) => {
                const isAskRow = r.px >= (center ?? 0);
                const own = myOrders.get(`b:${r.px}`) ?? myOrders.get(`a:${r.px}`);
                const ownBuy = myOrders.get(`b:${r.px}`);
                const flashing = flash && flash.px === r.px;
                return (
                  <div
                    key={r.px}
                    role="button"
                    tabIndex={0}
                    data-ladder-row={r.px}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      onRowClick(r.px, e.clientX - rect.left < rect.width / 2 ? "bid" : "ask");
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") onRowClick(r.px, "bid"); }}
                    title={`Click LEFT = buy limit · RIGHT = sell limit @ ${fmtPrice(meta, r.px)}${own ? " · click again to cancel your order" : ""}`}
                    style={{ height: rowH }}
                    className={`group relative flex w-full cursor-pointer items-stretch select-none ${
                      flashing
                        ? "bg-primaryBlue/25"
                        : own
                          ? "bg-primaryStroke/40"
                          : "hover:bg-primaryStroke/25"
                    }`}
                  >
                    {/* bid cell */}
                    <div className="relative flex flex-1 items-center justify-end overflow-hidden">
                      {r.bid != null && (
                        <div
                          className="absolute right-0 top-[2px] bottom-[2px] bg-increase/15"
                          style={{ width: `${Math.max(4, (r.bid / maxSide) * 92)}%` }}
                        />
                      )}
                      {ownBuy && (
                        <span className="absolute left-[6px] z-10 rounded-[3px] bg-increase px-[4px] font-GeistMono text-[9px] font-bold leading-[14px] text-[#062018]">
                          {compact(ownBuy.sz)}
                        </span>
                      )}
                      <span className="relative z-[1] px-[8px] text-[11px] text-increase tabular-nums">
                        {r.bid != null ? compact(r.bid) : ""}
                      </span>
                    </div>
                    {/* price */}
                    <span
                      className={`z-[1] flex w-[86px] items-center justify-center border-x border-primaryStroke/40 text-[11.5px] tabular-nums ${
                        isAskRow ? "text-decrease" : "text-increase"
                      } ${bestAsk === r.px || bestBid === r.px ? "font-bold text-textPrimary" : ""}`}
                    >
                      {fmtPrice(meta, r.px)}
                    </span>
                    {/* ask cell */}
                    <div className="relative flex flex-1 items-center overflow-hidden">
                      {r.ask != null && (
                        <div
                          className="absolute left-0 top-[2px] bottom-[2px] bg-decrease/15"
                          style={{ width: `${Math.max(4, (r.ask / maxSide) * 92)}%` }}
                        />
                      )}
                      {!ownBuy && myOrders.get(`a:${r.px}`) && (
                        <span className="absolute right-[6px] z-10 rounded-[3px] bg-decrease px-[4px] font-GeistMono text-[9px] font-bold leading-[14px] text-white">
                          {compact(myOrders.get(`a:${r.px}`)!.sz)}
                        </span>
                      )}
                      <span className="relative z-[1] px-[8px] text-[11px] text-decrease tabular-nums">
                        {r.ask != null ? compact(r.ask) : ""}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* spread footer */}
            <div className="flex h-[24px] flex-shrink-0 items-center justify-center gap-[14px] border-t border-primaryStroke bg-primaryStroke/40 px-[10px]">
              <span className="text-[11px] text-textSecondary">Spread</span>
              <span className="text-[11px] text-textPrimary tabular-nums">{spreadAbs != null ? fmtPrice(meta, spreadAbs) : "--"}</span>
              <span className="text-[11px] text-textSecondary tabular-nums">{spreadPct != null ? `${spreadPct.toFixed(3)}%` : ""}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ----------------------- account P&L strip ----------------------- */

export function PnlStrip({ compactMode = false }: { compactMode?: boolean }) {
  const balance = useTradeStore((s) => s.balance);
  const positions = useTradeStore((s) => s.positions);
  const fills = useTradeStore((s) => s.fills);
  const mids = usePerpsData((s) => s.mids);

  let upnl = 0;
  for (const p of Object.values(positions)) {
    if (!p || p.szi === 0) continue;
    const mark = mids[p.coin] ?? p.entryPx;
    upnl += (mark - p.entryPx) * p.szi;
  }
  const rpnl = fills.reduce((a, f) => a + f.closedPnl, 0);
  const cls = (v: number) => (v > 0 ? "text-increase" : v < 0 ? "text-decrease" : "text-textSecondary");
  const sign = (v: number) => (v >= 0 ? "+" : "-");
  /* compact dollars — the strip lives in narrow panels; $10.0K beats a
     clipped "$10000." (fx22) */
  const usd = (v: number) =>
    `$${Math.abs(v) >= 1000 ? `${(Math.abs(v) / 1000).toFixed(1)}K` : Math.abs(v).toFixed(2)}`;

  return (
    <div
      className={`flex flex-shrink-0 flex-row items-center gap-[10px] overflow-hidden whitespace-nowrap border-b border-primaryStroke bg-primaryStroke/25 px-[10px] ${
        compactMode ? "h-[34px]" : "h-[30px]"
      }`}
      data-testid="dom-pnl-strip"
    >
      <span className="flex shrink-0 items-center gap-[5px]">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.07em] text-textTertiary">rP&L</span>
        <span className={`font-GeistMono text-[11.5px] tabular-nums ${cls(rpnl)}`}>
          {sign(rpnl)}{usd(rpnl)}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-[5px]">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.07em] text-textTertiary">uP&L</span>
        <span className={`font-GeistMono text-[11.5px] tabular-nums ${cls(upnl)}`}>
          {sign(upnl)}{usd(upnl)}
        </span>
      </span>
      <span className="ml-auto hidden min-[360px]:flex shrink-0 items-center gap-[5px]">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.07em] text-textTertiary">Account</span>
        <span className="font-GeistMono text-[11.5px] text-textPrimary tabular-nums">
          {usd(balance + upnl)}
        </span>
      </span>
    </div>
  );
}

/* ------------------------------ helpers ------------------------------ */

function compact(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  if (v >= 1) return +v.toFixed(2) + "";
  return v.toFixed(4).replace(/\.?0+$/, "");
}

function LadderSkeleton({ rowH }: { rowH: number }) {
  return (
    <div aria-hidden className="flex w-full flex-col justify-center gap-[2px] px-0 py-[4px]">
      {Array.from({ length: 13 }).map((_, i) => (
        <div key={i} className="flex items-stretch" style={{ height: rowH }}>
          <div className="flex-1" />
          <div className="flex w-[86px] items-center justify-center">
            <div className="h-[10px] w-[46px] animate-pulse rounded-[3px] bg-primaryStroke/40" />
          </div>
          <div className="flex-1" />
        </div>
      ))}
    </div>
  );
}
