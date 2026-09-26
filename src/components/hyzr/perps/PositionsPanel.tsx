"use client";
/**
 * Bottom panel — Positions / Open Orders / Trades tabs with resizable height.
 * Table columns mirror the reference (Asset, Position, Position Value,
 * Entry Price, Mark Price, Liquidation Price, Margin Used (PNL), TP/SL, Close).
 */
import { useEffect, useMemo, useState } from "react";
import { usePerpsData } from "@/lib/hyperliquid/perpsStore";
import { baseName } from "@/lib/hyperliquid/types";
import {
  useTradeStore, unrealizedPnl, estLiqPrice, accountValueCalc, toast, type Position,
} from "@/lib/hyperliquid/tradeStore";
import { fmtPrice, fmtUsd, fmtUsdFull, fmtSzQuote, fmtDateTime, fmtTime } from "@/lib/hyperliquid/format";
import HlIcon from "./HlIcon";

type Tab = "positions" | "orders" | "trades";

export default function PositionsPanel({
  height, onResizeStart, soloTab,
}: {
  height: number;
  onResizeStart: (e: React.MouseEvent) => void;
  /** mobile module mode: render exactly ONE module full-screen, no tab
   *  header, no resize grip (the bottom tab bar owns navigation there) */
  soloTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>("positions");

  /* -------- solo (mobile module) mode -------- */
  if (soloTab) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
        {soloTab === "positions" && <PositionsTable />}
        {soloTab === "orders" && <OrdersTable />}
        {soloTab === "trades" && <FillsTable />}
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col overflow-hidden border-r border-primaryStroke" style={{ height }}>
      {/* fx18 resize grip — visible rounded bar, generous hit area */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize positions panel"
        title="Drag to resize"
        onMouseDown={onResizeStart}
        className="group relative hidden h-[10px] w-full flex-shrink-0 cursor-ns-resize items-center justify-center transition-colors hover:bg-primaryStroke/30 lg:flex"
      >
        <span className="h-[4px] w-[38px] rounded-full bg-primaryStroke transition-colors group-hover:bg-secondaryStroke" />
      </div>

      <div className="flex max-h-[36px] min-h-[36px] flex-1 flex-row items-center justify-start border-b border-primaryStroke pl-[8px] pr-[16px]">
        <div className="flex flex-1 flex-row items-center justify-start gap-[16px]">
          <PanelTab label="Positions" active={tab === "positions"} onClick={() => setTab("positions")} />
          <PanelTab label="Open Orders" active={tab === "orders"} onClick={() => setTab("orders")} />
          <PanelTab label="Trades" active={tab === "trades"} onClick={() => setTab("trades")} />
        </div>
      </div>

      {tab === "positions" && <PositionsTable />}
      {tab === "orders" && <OrdersTable />}
      {tab === "trades" && <FillsTable />}
    </div>
  );
}

function PanelTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative flex h-[28px] flex-row flex-nowrap items-center justify-start gap-[4px] rounded-[4px] px-[8px] text-nowrap"
    >
      <div className="pointer-events-none absolute inset-0 z-0 rounded-[4px] bg-primaryStroke/40 will-change-transform" style={{ opacity: active ? 1 : 0 }} />
      <div className={`relative z-[1] flex h-[36px] flex-1 flex-row items-center justify-start gap-[4px] pt-[2px] ${active ? "border-b-[2px] border-textPrimary" : "border-b-[2px] border-transparent"}`}>
        <span className={`text-[14px] font-medium ${active ? "text-textPrimary" : "text-textSecondary"}`}>{label}</span>
      </div>
    </button>
  );
}

/* ----------------------------- positions ------------------------------ */

export function PositionsTable() {
  const positions = useTradeStore((s) => s.positions);
  const mids = usePerpsData((s) => s.mids);
  const byName = usePerpsData((s) => s.byName);
  const closePosition = useTradeStore((s) => s.closePosition);
  const editTpSl = useTradeStore((s) => s.editTpSl);
  const [editing, setEditing] = useState<string | null>(null);
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");

  const list = Object.values(positions).filter((p): p is Position => !!p && p.szi !== 0);
  const accountValue = accountValueCalc(useTradeStore.getState().balance, positions, mids);

  const close = async (coin: string) => {
    const res = await closePosition(coin);
    if (!res.ok && res.error) toast(res.error, "error");
  };

  return (
    <div className="flex flex-1 flex-col overflow-x-auto">
      <div className="flex min-w-[1000px] flex-1 flex-col">
        <div className="flex max-h-[28px] min-h-[28px] flex-row items-center justify-start border-b border-primaryStroke px-[16px]">
          <TH flex="0.8">Asset</TH>
          <TH flex="1.2">Position</TH>
          <TH flex="0.8">Position Value</TH>
          <TH flex="0.8">Entry Price</TH>
          <TH flex="0.8">Mark Price</TH>
          <TH flex="0.8">Liquidation Price</TH>
          <TH flex="1.5" bold>Margin Used (PNL)</TH>
          <TH flex="0.8" center>TP / SL</TH>
          <TH flex="0.8" right>Close</TH>
        </div>
        <div className="flex min-w-[1000px] flex-1 flex-col overflow-y-auto pb-[56px]">
          {list.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-[14px] text-textSecondary">No open positions</span>
            </div>
          ) : (
            list.map((p) => {
              const meta = byName[p.coin]?.meta;
              const ctx = byName[p.coin]?.ctx;
              const mark = (ctx ? +ctx.markPx : 0) || mids[p.coin] || p.entryPx;
              const pnl = unrealizedPnl(p, mark);
              const posVal = Math.abs(p.szi) * mark;
              const marginUsed = (Math.abs(p.szi) * p.entryPx) / p.leverage + (p.isCross ? 0 : p.isolatedMargin);
              const liq = estLiqPrice(p, Math.max(0, accountValue - marginUsed));
              return (
                <div key={p.coin} className="flex max-h-[36px] min-h-[36px] flex-row items-center justify-start border-b border-primaryStroke/30 px-[16px] hover:bg-primaryStroke/20">
                  <TD flex="0.8">
                    <span className="flex items-center gap-[6px]">
                      <HlIcon coin={p.coin} size={18} />
                      <span className="text-[12px] font-medium text-textPrimary">{baseName(p.coin)}</span>
                    </span>
                    <span className="ml-[6px] rounded-[4px] bg-secondaryStroke/50 px-[4px] py-[1px] text-[10px] text-textSecondary">
                      {p.leverage}x {p.isCross ? "Cross" : "Iso"}
                    </span>
                  </TD>
                  <TD flex="1.2">
                    <span className={`text-[12px] font-medium ${p.szi > 0 ? "text-increase" : "text-decrease"}`}>
                      {fmtSzQuote(Math.abs(p.szi), meta)} {p.szi > 0 ? "Long" : "Short"}
                    </span>
                  </TD>
                  <TD flex="0.8"><span className="text-[12px] text-textSecondary">{fmtUsd(posVal)}</span></TD>
                  <TD flex="0.8"><span className="text-[12px] text-textSecondary">{fmtPrice(meta, p.entryPx)}</span></TD>
                  <TD flex="0.8"><span className="text-[12px] text-textSecondary">{fmtPrice(meta, mark)}</span></TD>
                  <TD flex="0.8"><span className="text-[12px] text-primaryOrange">{liq ? fmtPrice(meta, liq) : "--"}</span></TD>
                  <TD flex="1.5">
                    <span className="text-[12px] text-textSecondary">
                      {fmtUsdFull(marginUsed)}
                      <span className={`ml-[4px] ${pnl >= 0 ? "text-increase" : "text-decrease"}`}>
                        ({pnl >= 0 ? "+" : ""}{fmtUsdFull(pnl)})
                      </span>
                    </span>
                  </TD>
                  <TD flex="0.8" center>
                    {editing === p.coin ? (
                      <div className="flex items-center gap-[4px]" onMouseDown={(e) => e.stopPropagation()}>
                        <input
                          value={tp}
                          onChange={(e) => setTp(e.target.value.replace(/[^0-9.]/g, ""))}
                          placeholder="TP"
                          className="h-[22px] w-[64px] rounded-[4px] border border-primaryStroke bg-primaryStroke/50 px-[4px] text-[11px] text-textPrimary outline-none"
                        />
                        <input
                          value={sl}
                          onChange={(e) => setSl(e.target.value.replace(/[^0-9.]/g, ""))}
                          placeholder="SL"
                          className="h-[22px] w-[64px] rounded-[4px] border border-primaryStroke bg-primaryStroke/50 px-[4px] text-[11px] text-textPrimary outline-none"
                        />
                        <button
                          onClick={() => {
                            editTpSl(p.coin, tp ? parseFloat(tp) : null, sl ? parseFloat(sl) : null);
                            setEditing(null);
                          }}
                          className="rounded-[4px] bg-primaryBlue px-[6px] py-[2px] text-[11px] font-semibold text-background"
                        >
                          OK
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditing(p.coin); setTp(p.tpPx?.toString() ?? ""); setSl(p.slPx?.toString() ?? ""); }}
                        className="text-[12px] text-textSecondary hover:text-textPrimary"
                      >
                        {p.tpPx || p.slPx
                          ? `${p.tpPx ? fmtPrice(meta, p.tpPx) : "--"} / ${p.slPx ? fmtPrice(meta, p.slPx) : "--"}`
                          : "-- / --"}
                      </button>
                    )}
                  </TD>
                  <TD flex="0.8" right>
                    <button
                      onClick={() => close(p.coin)}
                      className="rounded-[4px] border border-primaryStroke/50 bg-primaryStroke/50 px-[8px] py-[2px] max-lg:min-h-[40px] text-[11px] font-medium text-textSecondary hover:bg-secondaryStroke/50 hover:text-textPrimary"
                    >
                      Market
                    </button>
                  </TD>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- open orders ---------------------------- */

export function OrdersTable() {
  const orders = useTradeStore((s) => s.orders);
  const cancelOrder = useTradeStore((s) => s.cancelOrder);
  const byName = usePerpsData((s) => s.byName);

  const sorted = useMemo(() => [...orders].sort((a, b) => b.createdAt - a.createdAt), [orders]);

  return (
    <div className="flex flex-1 flex-col overflow-x-auto">
      <div className="flex min-w-[900px] flex-1 flex-col">
        <div className="flex max-h-[28px] min-h-[28px] flex-row items-center justify-start border-b border-primaryStroke px-[16px]">
          <TH flex="1">Time</TH>
          <TH flex="0.8">Type</TH>
          <TH flex="0.8">Coin</TH>
          <TH flex="0.8">Direction</TH>
          <TH flex="0.8">Size</TH>
          <TH flex="0.8">Price</TH>
          <TH flex="0.8">Order Value</TH>
          <TH flex="0.6">Reduce Only</TH>
          <TH flex="0.6" right>Cancel</TH>
        </div>
        <div className="flex min-w-[900px] flex-1 flex-col overflow-y-auto pb-[56px]">
          {sorted.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-[14px] text-textSecondary">No open orders</span>
            </div>
          ) : (
            sorted.map((o) => {
              const meta = byName[o.coin]?.meta;
              return (
                <div key={o.id} className="flex max-h-[36px] min-h-[36px] flex-row items-center justify-start border-b border-primaryStroke/30 px-[16px] hover:bg-primaryStroke/20">
                  <TD flex="1"><span className="text-[12px] text-textSecondary">{fmtDateTime(o.createdAt)}</span></TD>
                  <TD flex="0.8"><span className="text-[12px] text-textPrimary">{o.kind === "Trigger" ? (o.isTp ? "Take Profit" : "Stop Loss") : "Limit"}</span></TD>
                  <TD flex="0.8"><span className="flex items-center gap-[6px]"><HlIcon coin={o.coin} size={16} /><span className="text-[12px] font-medium text-textPrimary">{baseName(o.coin)}</span></span></TD>
                  <TD flex="0.8"><span className={`text-[12px] ${o.isBuy ? "text-increase" : "text-decrease"}`}>{o.isBuy ? "Buy" : "Sell"}</span></TD>
                  <TD flex="0.8"><span className="text-[12px] text-textSecondary">{fmtSzQuote(o.sz, meta)}</span></TD>
                  <TD flex="0.8"><span className="text-[12px] text-textSecondary">{fmtPrice(meta, o.px)}</span></TD>
                  <TD flex="0.8"><span className="text-[12px] text-textSecondary">{fmtUsd(o.sz * o.px)}</span></TD>
                  <TD flex="0.6"><span className="text-[12px] text-textSecondary">{o.reduceOnly ? "Yes" : "No"}</span></TD>
                  <TD flex="0.6" right>
                    <button
                      onClick={() => cancelOrder(o.id)}
                      className="rounded-[4px] border border-primaryStroke/50 bg-primaryStroke/50 px-[8px] py-[2px] max-lg:min-h-[40px] text-[11px] font-medium text-textSecondary hover:bg-decrease/20 hover:text-decrease"
                    >
                      Cancel
                    </button>
                  </TD>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- fills -------------------------------- */

export function FillsTable() {
  const fills = useTradeStore((s) => s.fills);
  const byName = usePerpsData((s) => s.byName);
  const sorted = useMemo(() => [...fills].sort((a, b) => b.time - a.time), [fills]);

  return (
    <div className="flex flex-1 flex-col overflow-x-auto">
      <div className="flex min-w-[900px] flex-1 flex-col">
        <div className="flex max-h-[28px] min-h-[28px] flex-row items-center justify-start border-b border-primaryStroke px-[16px]">
          <TH flex="0.8">Time</TH>
          <TH flex="0.8">Coin</TH>
          <TH flex="1">Direction</TH>
          <TH flex="0.8">Price</TH>
          <TH flex="0.8">Size</TH>
          <TH flex="0.8">Trade Value</TH>
          <TH flex="0.8">Fee</TH>
          <TH flex="0.8" right>Closed PNL</TH>
        </div>
        <div className="flex min-w-[900px] flex-1 flex-col overflow-y-auto pb-[56px]">
          {sorted.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-[14px] text-textSecondary">No trades yet</span>
            </div>
          ) : (
            sorted.map((f) => {
              const meta = byName[f.coin]?.meta;
              return (
                <div key={f.id} className="flex max-h-[36px] min-h-[36px] flex-row items-center justify-start border-b border-primaryStroke/30 px-[16px] hover:bg-primaryStroke/20">
                  <TD flex="0.8"><span className="text-[12px] text-textSecondary">{fmtTime(f.time)}</span></TD>
                  <TD flex="0.8"><span className="flex items-center gap-[6px]"><HlIcon coin={f.coin} size={16} /><span className="text-[12px] font-medium text-textPrimary">{baseName(f.coin)}</span></span></TD>
                  <TD flex="1">
                    <span className={`text-[12px] ${f.dir.includes("Long") === f.dir.startsWith("Open") ? (f.dir === "Open Long" ? "text-increase" : "text-decrease") : f.dir === "Close Long" ? "text-decrease" : "text-increase"}`}>
                      {f.dir}{f.by === "liq" ? " (LIQ)" : f.by === "tp" ? " (TP)" : f.by === "sl" ? " (SL)" : ""}
                    </span>
                  </TD>
                  <TD flex="0.8"><span className="text-[12px] text-textSecondary">{fmtPrice(meta, f.px)}</span></TD>
                  <TD flex="0.8"><span className="text-[12px] text-textSecondary">{fmtSzQuote(f.sz, meta)}</span></TD>
                  <TD flex="0.8"><span className="text-[12px] text-textSecondary">{fmtUsd(f.sz * f.px)}</span></TD>
                  <TD flex="0.8"><span className="text-[12px] text-textSecondary">{fmtUsdFull(f.fee, 4)}</span></TD>
                  <TD flex="0.8" right>
                    <span className={`text-[12px] ${f.closedPnl > 0 ? "text-increase" : f.closedPnl < 0 ? "text-decrease" : "text-textSecondary"}`}>
                      {f.closedPnl !== 0 ? `${f.closedPnl >= 0 ? "+" : ""}${fmtUsdFull(f.closedPnl)}` : "--"}
                    </span>
                  </TD>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ cells --------------------------------- */

function TH({ children, flex, right, center, bold }: { children: React.ReactNode; flex: string; right?: boolean; center?: boolean; bold?: boolean }) {
  return (
    <div className="flex flex-row items-center justify-start" style={{ flex: `${flex} 1 0%` }}>
      <span
        className={`text-[12px] font-normal leading-[16px] text-textTertiary ${right ? "w-full text-right" : ""} ${center ? "w-full text-center" : ""}`}
        style={bold ? { fontWeight: 700, color: "rgb(102, 131, 255)" } : undefined}
      >
        {children}{bold ? " ↓" : ""}
      </span>
    </div>
  );
}

function TD({ children, flex, right, center }: { children: React.ReactNode; flex: string; right?: boolean; center?: boolean }) {
  return (
    <div className="flex flex-row items-center justify-start" style={{ flex: `${flex} 1 0%`, justifyContent: right ? "flex-end" : center ? "center" : "flex-start" }}>
      {children}
    </div>
  );
}
